// Test-only Monte Carlo of a whole M2.5 run on the PRODUCTION engine (core/run.ts spinRun/stopRun + data),
// played by the same policies as design's reference simulator tools/sim/ms-sim.mjs (spec m25-multispin 8.6, 11).
// Only decisions live here (which offer / which edit / spin again or stop); every rule (spin, judge, pooling,
// Focus, battle, heal, offers, edit limits) is the real engine.
//
// Seeding mirrors ms-sim.mjs so a same-seed comparison with the design simulator can be exact:
//   - runs are split into `chunks`; chunk c has seed (seed * 1000003 + c * 7919) >>> 0, a chunk master rng
//     that yields one run seed per run, and a chunk lookahead rng (seed ^ 0x5bd1e995) shared by the smart policy
//   - per run: an offer/takeall rng (runSeed ^ 0xa5a5a5a5) and, per battle, a spin rng
//     ((runSeed + (stage + 1) * 0x9e3779b9) >>> 0)
//   - the engine draws spins and reward offers from the single rng passed to spinRun/stopRun, so a switching
//     rng hands the first 9 draws of a spinRun to the battle rng and everything else to the offer rng
//   - design draws every spin of a turn up front (common random numbers across stop policies); production draws
//     on demand (spec 8.3), so after each turn the battle rng skips the 9 draws of every unused spin
// The reel editor and the smart policy's lookahead are separate rngs from the run rng (spec 8.3, REQ-009).
import { previewStop } from '../core/battle';
import { executableEffects, EFFECT_IGNORE_GUARD } from '../core/effects';
import { judge } from '../core/judge';
import { GRID_SIZE, LINES } from '../core/lines';
import { power, selectTier } from '../core/outcome';
import { nextGrade } from '../core/reel-edit';
import { createRng, drawUnit, type Rng } from '../core/rng';
import {
  canAddToReel,
  canDeleteFromReel,
  canEnhanceSymbol,
  chooseOffer,
  deleteSymbol,
  enhanceSymbol,
  passEdit,
  skipOffer,
  spinRun,
  startRun,
  stopRun,
  type Run,
  type RunSpinResult,
  type RunTurnResult,
} from '../core/run';
import { spin } from '../core/spin';
import { resolveTurnStats } from '../core/turn-stats';
import type { ActionDef, Board, Reel, ReelSymbol, RunDefinition } from '../core/types';
import { M25_RUN } from '../data';

export type StopPolicyName = 'smart' | 'max' | 'once';
export type EditPolicyName = 'greedy' | 'takeall' | 'none';

// ---- policy parameters (simulator-only, copied from tools/sim/ms-config.mjs) ----
const EDITOR_SAMPLES = 400;
const EDITOR_GUARD_WEIGHT = 0.7;
const EDITOR_SEED_OFFSET = 99;
const IMPROVEMENT_EPSILON = 1e-9;
const SMART = { guardWeight: 0.8, lethalBonus: 10, deathPenalty: 60, bankSize: 384, firstSamples: 40, secondSamples: 40 };
// ---- seeding constants (ms-sim.mjs) ----
const DEFAULT_CHUNKS = 40;
const CHUNK_SEED_MULTIPLIER = 1_000_003;
const CHUNK_SEED_STRIDE = 7_919;
const LOOKAHEAD_SEED_XOR = 0x5bd1e995;
const OFFER_SEED_XOR = 0xa5a5a5a5;
const BATTLE_SEED_STRIDE = 0x9e3779b9;
const UINT32_RANGE = 2 ** 32;
const SPIN_DRAWS = GRID_SIZE * GRID_SIZE;
/** Pooled line counts the tier lookup tables cover (design: 80). */
const MAX_LINE_LOOKUP = 80;
const MAX_TURNS_PER_RUN = 5000;
const MAX_LOOKAHEAD_SPINS = 16;

export interface StageStats {
  reached: number;
  won: number;
  turns: number;
  /** Turns whose pooled output was 0 (TurnReport.empty). */
  emptyTurns: number;
  spins: number;
  /** Spins with no fired line (SpinReport.empty). */
  emptySpins: number;
  /** Turns the player stopped before the max (stopReason player_stop). */
  earlyStops: number;
  /** Early stops where the stop already defeated the enemy. */
  lethalStops: number;
  /** Turns where ignore_guard was active on any outcome. */
  ignoreGuardTurns: number;
}

export interface MultispinBalanceResult {
  runs: number;
  wins: number;
  winRate: number;
  /** Runs lost at each stage index. */
  deaths: number[];
  stages: StageStats[];
  /** Pooled-output-empty turns / turns over every boss battle. */
  bossEmptyRate: number;
  bossEmptySpinRate: number;
  earlyStopRate: number;
  /** Early stops that were not lethal / all turns. */
  nonLethalStopRate: number;
  spinsPerTurn: number;
}

export interface SimulateOptions {
  stop: StopPolicyName;
  edit: EditPolicyName;
  runs: number;
  seed: number;
  chunks?: number;
  definition?: RunDefinition;
}

/** First `spinDraws` calls come from the battle rng, every other call from the offer rng. */
class SwitchingRng {
  private spinDraws = 0;
  constructor(
    private readonly battle: () => Rng,
    private readonly offers: Rng,
  ) {}

  readonly rng: Rng = () => {
    if (this.spinDraws > 0) {
      this.spinDraws--;
      return this.battle()();
    }
    return this.offers();
  };

  expectSpin(): void {
    this.spinDraws = SPIN_DRAWS;
  }

  expectNoSpin(): void {
    this.spinDraws = 0;
  }

  /** Throws unless the previous spin used exactly its 9 draws. */
  assertSpinDrawn(): void {
    if (this.spinDraws !== 0) {
      throw new Error(`simulator: spin used ${SPIN_DRAWS - this.spinDraws} battle draws, expected ${SPIN_DRAWS}`);
    }
  }
}

const symbolKey = (s: ReelSymbol): string => `${s.actionId}${s.grade}`;

/**
 * Port of ms-engine evalReels: fixed common-random-number sample of FULL turns (effective max spins, pooled,
 * no Focus), score = E[damage before enemy guard] + guardWeight * E[guard]. Memoised on the SORTED reel
 * composition per chunk exactly like design (so the first evaluated order of equal compositions is reused
 * inside a chunk). Computed values are additionally memoised across chunks on the ORDERED reels, which never
 * changes a result (same uniforms, same order => same value) but avoids recomputing identical reels per chunk.
 */
class TurnScorer {
  private readonly uniforms: Float64Array;
  private cache = new Map<string, number>();
  private readonly computed = new Map<string, number>();

  constructor(
    private readonly definition: RunDefinition,
    private readonly spinsPerTurn: number,
    seed: number,
  ) {
    const rng = createRng(seed + EDITOR_SEED_OFFSET);
    this.uniforms = new Float64Array(EDITOR_SAMPLES * spinsPerTurn * SPIN_DRAWS);
    for (let i = 0; i < this.uniforms.length; i++) this.uniforms[i] = drawUnit(rng);
  }

  /** Design keeps one sorted-composition memo per chunk. */
  startChunk(): void {
    this.cache = new Map();
  }

  score(reels: readonly Reel[]): number {
    const key = reels.map((reel) => reel.map(symbolKey).sort().join(',')).join('|');
    let value = this.cache.get(key);
    if (value === undefined) {
      const orderedKey = reels.map((reel) => reel.map(symbolKey).join(',')).join('|');
      value = this.computed.get(orderedKey);
      if (value === undefined) {
        value = this.compute(reels);
        this.computed.set(orderedKey, value);
      }
      this.cache.set(key, value);
    }
    return value;
  }

  private compute(reels: readonly Reel[]): number {
    const { actions, grades } = this.definition;
    let damage = 0;
    let guard = 0;
    let offset = 0;
    for (let sample = 0; sample < EDITOR_SAMPLES; sample++) {
      const pooled = new Map<string, { count: number; sum: number }>();
      for (let spinIndex = 0; spinIndex < this.spinsPerTurn; spinIndex++) {
        const board: Board = reels.map((reel) => {
          const pool = [...reel];
          const column: ReelSymbol[] = [];
          for (let row = 0; row < GRID_SIZE; row++) {
            column.push(...pool.splice(Math.floor((this.uniforms[offset++] as number) * pool.length), 1));
          }
          return column;
        });
        for (const line of LINES) {
          const cells = line.cells.map((c) => (board[c.reel] as ReelSymbol[])[c.row] as ReelSymbol);
          const first = cells[0] as ReelSymbol;
          if (cells.every((c) => c.actionId === first.actionId)) {
            const entry = pooled.get(first.actionId) ?? { count: 0, sum: 0 };
            entry.count++;
            entry.sum += cells.reduce((s, c) => s + (grades[c.grade]?.value ?? 0), 0);
            pooled.set(first.actionId, entry);
          }
        }
      }
      for (const [actionId, { count, sum }] of pooled) {
        const action = actions.find((a) => a.id === actionId);
        if (!action) continue;
        const { multiplierNum } = selectTier(action.tiers, count);
        damage += power(action.basePower.damage, sum, multiplierNum);
        guard += power(action.basePower.guard, sum, multiplierNum);
      }
    }
    return (damage + EDITOR_GUARD_WEIGHT * guard) / EDITOR_SAMPLES;
  }
}

interface Pick {
  offerIndex: number;
  reelIndex: number;
}

interface EditChoice {
  kind: 'delete' | 'enhance';
  reelIndex: number;
  symbolIndex: number;
}

interface EditPolicy {
  pickOffer(run: Run, offers: readonly ReelSymbol[], rng: Rng): Pick | null;
  pickEdit(run: Run): EditChoice | null;
}

function greedyEditor(scorer: TurnScorer): EditPolicy {
  return {
    pickOffer(run, offers) {
      const { reels } = run.state;
      let bestScore = scorer.score(reels) + IMPROVEMENT_EPSILON;
      let best: Pick | null = null;
      offers.forEach((offer, offerIndex) =>
        reels.forEach((_, reelIndex) => {
          if (!canAddToReel(run, reelIndex)) return;
          const next = reels.map((reel, i) => (i === reelIndex ? [...reel, offer] : reel));
          const score = scorer.score(next);
          if (score > bestScore) {
            bestScore = score;
            best = { offerIndex, reelIndex };
          }
        }),
      );
      return best;
    },
    pickEdit(run) {
      const { reels } = run.state;
      let bestScore = scorer.score(reels) + IMPROVEMENT_EPSILON;
      let best: EditChoice | null = null;
      reels.forEach((reel, reelIndex) => {
        const seen = new Set<string>();
        reel.forEach((symbol, symbolIndex) => {
          if (seen.has(symbolKey(symbol))) return;
          seen.add(symbolKey(symbol));
          if (canDeleteFromReel(run, reelIndex)) {
            const next = reels.map((r, i) => (i === reelIndex ? r.filter((_, j) => j !== symbolIndex) : r));
            const score = scorer.score(next);
            if (score > bestScore) {
              bestScore = score;
              best = { kind: 'delete', reelIndex, symbolIndex };
            }
          }
          if (canEnhanceSymbol(run, reelIndex, symbolIndex)) {
            const grade = nextGrade(run.definition.grades, symbol.grade) as number;
            const next = reels.map((r, i) =>
              i === reelIndex ? r.map((s, j) => (j === symbolIndex ? { actionId: s.actionId, grade } : s)) : r,
            );
            const score = scorer.score(next);
            if (score > bestScore) {
              bestScore = score;
              best = { kind: 'enhance', reelIndex, symbolIndex };
            }
          }
        });
      });
      return best;
    },
  };
}

const NO_EDIT: Record<'takeall' | 'none', EditPolicy> = {
  none: { pickOffer: () => null, pickEdit: () => null },
  takeall: {
    pickOffer(run, offers, rng) {
      const offerIndex = Math.floor(rng() * offers.length);
      const open = run.state.reels.map((_, i) => i).filter((i) => canAddToReel(run, i));
      return open.length ? { offerIndex, reelIndex: open[Math.floor(rng() * open.length)] as number } : null;
    },
    pickEdit: () => null,
  },
};

// ---- smart stop policy (port of ms-engine STOP_POLICIES.smart) ----

/** Per-action pooled tally, indexed in the definition's action (resolution) order: line counts, then grade sums. */
type Tally = Int32Array;

interface TurnOutput {
  guard: number;
  /** Damage the enemy guard absorbs first (skill and normal attack). */
  normal: number;
  /** ignore_guard damage. */
  ignoring: number;
}

interface Situation {
  enemyHp: number;
  enemyGuard: number;
  incoming: number;
  playerHp: number;
}

/** Evaluates pooled tallies with the engine's own `power`, `selectTier` and effect rules. */
class TurnMath {
  private readonly pooled: Tally;
  private readonly tierNum: number[][];
  private readonly ignores: boolean[][];

  constructor(
    private readonly actions: readonly ActionDef[],
    readonly maxSpins: number,
    private readonly focusPerUnused: number,
  ) {
    this.pooled = new Int32Array(actions.length * 2);
    this.tierNum = actions.map((action) =>
      Array.from({ length: MAX_LINE_LOOKUP }, (_, n) => (n === 0 ? 0 : selectTier(action.tiers, n).multiplierNum)),
    );
    this.ignores = actions.map((action) =>
      Array.from({ length: MAX_LINE_LOOKUP }, (_, n) => n > 0 && executableEffects(action, n).some((e) => e.id === EFFECT_IGNORE_GUARD)),
    );
  }

  newTally(): Tally {
    return new Int32Array(this.actions.length * 2);
  }

  /** Output of the first `count` tallies when `maxSpins - count` spins stay unused. */
  output(tallies: readonly Tally[], count: number): TurnOutput {
    const n = this.actions.length;
    this.pooled.fill(0);
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < n * 2; j++) this.pooled[j] = (this.pooled[j] as number) + ((tallies[i] as Tally)[j] as number);
    }
    const focusPct = this.focusPerUnused * (this.maxSpins - count);
    const out: TurnOutput = { guard: 0, normal: 0, ignoring: 0 };
    this.actions.forEach((action, a) => {
      const lines = this.pooled[a] as number;
      if (!lines) return;
      const sum = this.pooled[n + a] as number;
      const num = this.tierNum[a]?.[lines] as number;
      out.guard += power(action.basePower.guard, sum, num, focusPct);
      const damage = power(action.basePower.damage, sum, num, focusPct);
      if (this.ignores[a]?.[lines]) out.ignoring += damage;
      else out.normal += damage;
    });
    return out;
  }

  enemyHpAfter(out: TurnOutput, s: Situation): number {
    const absorbed = Math.min(s.enemyGuard, out.normal);
    return s.enemyHp - (out.normal - absorbed) - out.ignoring;
  }

  utility(out: TurnOutput, s: Situation): number {
    const hp = this.enemyHpAfter(out, s);
    if (hp <= 0) return s.enemyHp + s.incoming + SMART.lethalBonus;
    const absorbed = Math.min(out.guard, s.incoming);
    let value = s.enemyHp - hp + SMART.guardWeight * absorbed;
    if (s.incoming - absorbed >= s.playerHp) value -= SMART.deathPenalty;
    return value;
  }
}

/** Looks ahead with its own rng (never the run rng) over a bank of single-spin tallies of the current reels. */
class SmartStopper {
  private bank: Tally[] = [];
  private readonly lookahead: Tally[];

  constructor(
    private readonly math: TurnMath,
    private readonly definition: RunDefinition,
    private readonly lrng: Rng,
  ) {
    this.lookahead = Array.from({ length: MAX_LOOKAHEAD_SPINS }, () => math.newTally());
  }

  /** Design builds the bank at the start of every battle from the reels at that moment. */
  startBattle(reels: readonly Reel[]): void {
    this.bank = Array.from({ length: SMART.bankSize }, () => this.tallyOf(spin(reels, this.lrng)));
  }

  tallies(boards: readonly Board[]): Tally[] {
    return boards.map((board) => this.tallyOf(board));
  }

  private tallyOf(board: Board): Tally {
    const tally = this.math.newTally();
    const { actions, grades } = this.definition;
    const judged = judge(board, grades);
    actions.forEach((action, a) => {
      const entry = judged.byAction[action.id];
      if (entry) {
        tally[a] = entry.lineCount;
        tally[actions.length + a] = entry.gradeSumTotal;
      }
    });
    return tally;
  }

  /** true = stop now. `spins` are the per-spin tallies played so far (1 <= spins.length < max). */
  shouldStop(spins: readonly Tally[], situation: Situation, lethalNow: boolean): boolean {
    if (lethalNow) return true;
    const k = spins.length;
    for (let i = 0; i < k; i++) this.lookahead[i] = spins[i] as Tally; // references, never copies into shared bank tallies
    return this.valueStop(k, situation) >= this.valueContinue(k, situation);
  }

  private valueStop(k: number, s: Situation): number {
    return this.math.utility(this.math.output(this.lookahead, k), s);
  }

  private pick(): Tally {
    return this.bank[Math.floor(this.lrng() * this.bank.length)] as Tally;
  }

  private valueContinue(k: number, s: Situation): number {
    const left = this.math.maxSpins - k;
    const la = this.lookahead;
    if (left === 1) {
      let sum = 0;
      for (const x of this.bank) {
        la[k] = x;
        sum += this.valueStop(k + 1, s);
      }
      return sum / this.bank.length;
    }
    if (left === 2) {
      let sum = 0;
      for (let i = 0; i < SMART.firstSamples; i++) {
        la[k] = this.pick();
        const stopSecond = this.valueStop(k + 1, s);
        let cont = 0;
        for (let j = 0; j < SMART.secondSamples; j++) {
          la[k + 1] = this.pick();
          cont += this.valueStop(k + 2, s);
        }
        sum += Math.max(stopSecond, cont / SMART.secondSamples);
      }
      return sum / SMART.firstSamples;
    }
    let best = -Infinity;
    for (let more = 1; more <= left; more++) {
      let sum = 0;
      for (let i = 0; i < SMART.firstSamples; i++) {
        for (let q = 0; q < more; q++) la[k + q] = this.pick();
        sum += this.valueStop(k + more, s);
      }
      best = Math.max(best, sum / SMART.firstSamples);
    }
    return best;
  }
}

function newStageStats(): StageStats {
  return { reached: 0, won: 0, turns: 0, emptyTurns: 0, spins: 0, emptySpins: 0, earlyStops: 0, lethalStops: 0, ignoreGuardTurns: 0 };
}

interface ChunkContext {
  definition: RunDefinition;
  stop: StopPolicyName;
  editor: EditPolicy;
  smart: SmartStopper | null;
  stages: StageStats[];
  deaths: number[];
}

function playRun(runSeed: number, context: ChunkContext): boolean {
  const { definition, stages, smart } = context;
  const offerRng = createRng((runSeed ^ OFFER_SEED_XOR) >>> 0);
  let battleRng = createRng(0);
  let battleStage = -1;
  const switching = new SwitchingRng(() => battleRng, offerRng);
  const { rng } = switching;
  let run = startRun(definition);
  let turnsThisRun = 0;

  while (run.state.phase !== 'victory' && run.state.phase !== 'defeat') {
    const { phase } = run.state;
    if (phase === 'battle') {
      const stageIndex = run.state.stageIndex;
      const stat = stages[stageIndex] as StageStats;
      if (stageIndex !== battleStage) {
        battleStage = stageIndex;
        battleRng = createRng((runSeed + (stageIndex + 1) * BATTLE_SEED_STRIDE) >>> 0);
        stat.reached++;
        smart?.startBattle(run.state.reels);
      }
      if (++turnsThisRun > MAX_TURNS_PER_RUN) throw new Error('simulateMultispinRuns: run exceeded the turn cap');
      const turn = playTurn(run, context, stat, switching, rng);
      run = turn.run;
      for (let i = 0; i < turn.report.unusedSpins * SPIN_DRAWS; i++) battleRng();
      stat.turns++;
      stat.spins += turn.report.spinsUsed;
      stat.emptySpins += turn.report.spins.filter((s) => s.empty).length;
      if (turn.report.empty) stat.emptyTurns++;
      if (turn.report.outcomes.some((o) => o.ignoreGuard)) stat.ignoreGuardTurns++;
      if (turn.report.stopReason === 'player_stop') stat.earlyStops++;
      if (run.state.phase !== 'battle' && run.state.phase !== 'defeat') stat.won++;
    } else if (phase === 'reward_add') {
      const offers = run.state.offers as readonly ReelSymbol[];
      const pick = context.editor.pickOffer(run, offers, offerRng);
      run = (pick ? chooseOffer(run, pick.offerIndex, pick.reelIndex) : skipOffer(run)).run;
    } else {
      const edit = context.editor.pickEdit(run);
      if (!edit) run = passEdit(run).run;
      else if (edit.kind === 'delete') run = deleteSymbol(run, edit.reelIndex, edit.symbolIndex).run;
      else run = enhanceSymbol(run, edit.reelIndex, edit.symbolIndex).run;
    }
  }
  if (run.state.phase === 'victory') return true;
  context.deaths[run.state.stageIndex] = (context.deaths[run.state.stageIndex] ?? 0) + 1;
  return false;
}

/** One turn through spinRun / stopRun with the stop policy deciding after every non-final spin. */
function playTurn(run: Run, context: ChunkContext, stat: StageStats, switching: SwitchingRng, rng: Rng): RunTurnResult {
  let current = run;
  for (;;) {
    switching.expectSpin();
    const step: RunSpinResult = spinRun(current, rng);
    switching.assertSpinDrawn();
    if (step.result) return step.result;
    current = step.run;
    if (!wantsAnotherSpin(current, context, stat)) {
      switching.expectNoSpin();
      return stopRun(current, rng);
    }
  }
}

function wantsAnotherSpin(run: Run, context: ChunkContext, stat: StageStats): boolean {
  if (context.stop === 'max') return true;
  if (context.stop === 'once') return false;
  const battle = run.state.battle;
  const session = battle?.session;
  if (!battle || session?.kind !== 'spinning') throw new Error('simulator: expected a spinning battle');
  const preview = previewStop(battle);
  const smart = context.smart as SmartStopper;
  const tallies = smart.tallies(session.spins.map((record) => record.board));
  const stopNow = smart.shouldStop(
    tallies,
    { enemyHp: battle.state.enemyHp, enemyGuard: battle.state.enemyGuard, incoming: preview.incoming, playerHp: battle.state.playerHp },
    preview.lethal,
  );
  if (stopNow && preview.lethal) stat.lethalStops++;
  return !stopNow;
}

/** Plays `runs` complete runs on the production engine; deterministic for (options). */
export function simulateMultispinRuns(options: SimulateOptions): MultispinBalanceResult {
  const { stop, edit, runs, seed } = options;
  const chunks = options.chunks ?? DEFAULT_CHUNKS;
  const definition = options.definition ?? M25_RUN;
  const stages = definition.stages.map(newStageStats);
  const deaths = new Array<number>(definition.stages.length).fill(0);
  let wins = 0;
  let played = 0;
  const turnStats = resolveTurnStats(definition.character.spinsPerTurn, definition.rules, []);
  const perChunk = Math.ceil(runs / chunks);
  const scorer = edit === 'greedy' ? new TurnScorer(definition, turnStats.maxSpins, seed) : null;

  const editor: EditPolicy = scorer ? greedyEditor(scorer) : NO_EDIT[edit as 'takeall' | 'none'];
  for (let c = 0; c < chunks; c++) {
    const count = Math.min(perChunk, runs - c * perChunk);
    if (count <= 0) continue;
    const chunkSeed = (seed * CHUNK_SEED_MULTIPLIER + c * CHUNK_SEED_STRIDE) >>> 0;
    const master = createRng(chunkSeed);
    const lookahead = createRng((chunkSeed ^ LOOKAHEAD_SEED_XOR) >>> 0);
    const math = new TurnMath(definition.actions, turnStats.maxSpins, turnStats.focusPctPerUnused);
    scorer?.startChunk();
    const context: ChunkContext = {
      definition,
      stop,
      editor,
      smart: stop === 'smart' ? new SmartStopper(math, definition, lookahead) : null,
      stages,
      deaths,
    };
    for (let i = 0; i < count; i++) {
      const runSeed = Math.floor(master() * UINT32_RANGE);
      played++;
      if (playRun(runSeed, context)) wins++;
    }
  }

  const boss = stages[stages.length - 1] as StageStats;
  const totals = stages.reduce(
    (t, s) => ({ turns: t.turns + s.turns, spins: t.spins + s.spins, early: t.early + s.earlyStops, lethal: t.lethal + s.lethalStops }),
    { turns: 0, spins: 0, early: 0, lethal: 0 },
  );
  return {
    runs: played,
    wins,
    winRate: wins / played,
    deaths,
    stages,
    bossEmptyRate: boss.turns ? boss.emptyTurns / boss.turns : 0,
    bossEmptySpinRate: boss.spins ? boss.emptySpins / boss.spins : 0,
    earlyStopRate: totals.turns ? totals.early / totals.turns : 0,
    nonLethalStopRate: totals.turns ? (totals.early - totals.lethal) / totals.turns : 0,
    spinsPerTurn: totals.turns ? totals.spins / totals.turns : 0,
  };
}

/** Binomial standard error of a rate measured over n independent samples. */
export function binomialStdErr(rate: number, n: number): number {
  return Math.sqrt((rate * (1 - rate)) / n);
}
