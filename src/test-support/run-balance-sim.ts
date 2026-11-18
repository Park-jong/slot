// Test-only Monte Carlo of a whole M2 run on the PRODUCTION engine (core/run.ts + data), played by the
// same policies as the design reference simulator tools/sim/run-sim.mjs (spec m2-run-spec.md section 10).
// Only the policy (which offer / which edit) lives here; every rule (spin, judge, battle, heal, offers,
// edit limits) is the real engine. The policy's reel scorer is a port of design's evalReels: a fixed
// common-random-number sample of spins scored as expected damage + GUARD_WEIGHT * expected guard.
// M2.5 note: this file simulates the M2 rules only (default M2_RUN, spinsPerTurn 1, playRunTurn = one spin
// and stop). The M2.5 multi-spin simulator (full-turn scoring, smart/max/once stop policies via spinRun/stopRun,
// M25_RUN) is src/test-support/multispin-balance-sim.ts (m25-multispin-spec 8.6, REQ-009).
import { GRID_SIZE, LINES } from '../core/lines';
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
  playRunTurn,
  skipOffer,
  startRun,
  type Run,
} from '../core/run';
import type { Reel, ReelSymbol, RunDefinition } from '../core/types';
import { M2_RUN } from '../data';

export type PolicyName = 'greedy' | 'takeall' | 'none';

/** Number of spins in the policy's scoring sample (design: samples=700). */
export const SCORING_SAMPLES = 700;
/** Weight of expected guard against expected damage in the policy score (design: wG=0.7). */
const GUARD_WEIGHT = 0.7;
/** Strict improvement margin a candidate must beat the current reels by (design: 1e-9). */
const IMPROVEMENT_EPSILON = 1e-9;
/** Design seeds the scoring sample with seed + 99. */
const SCORING_SEED_OFFSET = 99;
const SPIN_DRAWS = GRID_SIZE * GRID_SIZE;
const MULTIPLIER_DENOMINATOR = 2;
/** Guards against a stuck run. */
const MAX_TURNS_PER_RUN = 5000;

export interface StageStats {
  reached: number;
  won: number;
  turns: number;
  emptyTurns: number;
}

export interface RunBalanceResult {
  runs: number;
  wins: number;
  winRate: number;
  /** Runs lost at each stage index. */
  deaths: number[];
  stages: StageStats[];
  /** Empty turns / turns over every battle against the boss (lost ones included), as design measures it. */
  bossEmptyRate: number;
  /** Mean player HP after winning the boss battle, over won runs. */
  bossWinHp: number;
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

interface Policy {
  pickOffer(run: Run, offers: readonly ReelSymbol[], rng: Rng): Pick | null;
  pickEdit(run: Run): EditChoice | null;
}

const symbolKey = (s: ReelSymbol): string => `${s.actionId}${s.grade}`;

/** Port of design's evalReels score (memoised: the sample is fixed, so equal reels always score equally). */
class ReelScorer {
  private readonly uniforms: Float64Array;
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly definition: RunDefinition,
    seed: number,
  ) {
    const rng = createRng(seed + SCORING_SEED_OFFSET);
    this.uniforms = new Float64Array(SCORING_SAMPLES * SPIN_DRAWS);
    for (let i = 0; i < this.uniforms.length; i++) this.uniforms[i] = drawUnit(rng);
  }

  score(reels: readonly Reel[]): number {
    const key = reels.map((reel) => reel.map(symbolKey).join(',')).join('|');
    let value = this.cache.get(key);
    if (value === undefined) {
      value = this.compute(reels);
      this.cache.set(key, value);
    }
    return value;
  }

  private compute(reels: readonly Reel[]): number {
    const { actions, grades } = this.definition;
    let damage = 0;
    let guard = 0;
    let offset = 0;
    for (let spin = 0; spin < SCORING_SAMPLES; spin++) {
      const board = reels.map((reel) => {
        const pool = [...reel];
        const column: ReelSymbol[] = [];
        for (let row = 0; row < GRID_SIZE; row++) {
          column.push(...pool.splice(Math.floor((this.uniforms[offset++] as number) * pool.length), 1));
        }
        return column;
      });
      const lines = new Map<string, { count: number; sum: number }>();
      for (const line of LINES) {
        const cells = line.cells.map((c) => (board[c.reel] as ReelSymbol[])[c.row] as ReelSymbol);
        const first = cells[0] as ReelSymbol;
        if (cells.every((c) => c.actionId === first.actionId)) {
          const entry = lines.get(first.actionId) ?? { count: 0, sum: 0 };
          entry.count++;
          entry.sum += cells.reduce((s, c) => s + (grades[c.grade]?.value ?? 0), 0);
          lines.set(first.actionId, entry);
        }
      }
      for (const [actionId, { count, sum }] of lines) {
        const action = actions.find((a) => a.id === actionId);
        if (!action) continue;
        const tier = action.tiers.filter((t) => t.lineCount <= count).sort((a, b) => b.lineCount - a.lineCount)[0];
        const mult = tier?.multiplierNum ?? 0;
        damage += Math.floor((action.basePower.damage * sum * mult) / MULTIPLIER_DENOMINATOR);
        guard += Math.floor((action.basePower.guard * sum * mult) / MULTIPLIER_DENOMINATOR);
      }
    }
    return (damage + GUARD_WEIGHT * guard) / SCORING_SAMPLES;
  }
}

function greedyPolicy(scorer: ReelScorer): Policy {
  return {
    pickOffer(run, offers) {
      const { reels } = run.state;
      let bestScore = scorer.score(reels) + IMPROVEMENT_EPSILON;
      let best: Pick | null = null;
      // Candidate order (offer outer, reel inner) and strict '>' match design, so ties resolve identically.
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

const NO_EDIT_POLICIES: Record<'takeall' | 'none', Policy> = {
  none: { pickOffer: () => null, pickEdit: () => null },
  takeall: {
    // Random offer into a random non-full reel, never skips, never edits (design's baseline).
    pickOffer(run, offers, rng) {
      const offerIndex = Math.floor(rng() * offers.length);
      const open = run.state.reels.map((_, i) => i).filter((i) => canAddToReel(run, i));
      return open.length ? { offerIndex, reelIndex: open[Math.floor(rng() * open.length)] as number } : null;
    },
    pickEdit: () => null,
  },
};

/** Plays `runs` complete runs with one shared rng (battles and offers), exactly like design's runPolicy. */
export function simulateRuns(
  policyName: PolicyName,
  runs: number,
  seed: number,
  definition: RunDefinition = M2_RUN,
): RunBalanceResult {
  const policy = policyName === 'greedy' ? greedyPolicy(new ReelScorer(definition, seed)) : NO_EDIT_POLICIES[policyName];
  const rng = createRng(seed);
  const stages: StageStats[] = definition.stages.map(() => ({ reached: 0, won: 0, turns: 0, emptyTurns: 0 }));
  const bossIndex = definition.stages.length - 1;
  const deaths = new Array<number>(definition.stages.length).fill(0);
  let wins = 0;
  let bossWinHpTotal = 0;

  for (let i = 0; i < runs; i++) {
    let run = startRun(definition);
    let turnsThisRun = 0;
    while (run.state.phase !== 'victory' && run.state.phase !== 'defeat') {
      const { phase } = run.state;
      if (phase === 'battle') {
        if (++turnsThisRun > MAX_TURNS_PER_RUN) throw new Error('simulateRuns: run exceeded the turn cap');
        const stat = stages[run.state.stageIndex] as StageStats;
        if (run.state.battle?.state.turn === 1) stat.reached++;
        const result = playRunTurn(run, rng);
        stat.turns++;
        if (result.report.judgement.firedLines.length === 0) stat.emptyTurns++;
        run = result.run;
        if (run.state.phase !== 'battle' && run.state.phase !== 'defeat') stat.won++;
        if (run.state.phase === 'victory') bossWinHpTotal += run.state.playerHp;
      } else if (phase === 'reward_add') {
        const offers = run.state.offers as readonly ReelSymbol[];
        const pick = policy.pickOffer(run, offers, rng);
        run = (pick ? chooseOffer(run, pick.offerIndex, pick.reelIndex) : skipOffer(run)).run;
      } else {
        const edit = policy.pickEdit(run);
        if (!edit) run = passEdit(run).run;
        else if (edit.kind === 'delete') run = deleteSymbol(run, edit.reelIndex, edit.symbolIndex).run;
        else run = enhanceSymbol(run, edit.reelIndex, edit.symbolIndex).run;
      }
    }
    if (run.state.phase === 'victory') wins++;
    else deaths[run.state.stageIndex] = (deaths[run.state.stageIndex] ?? 0) + 1;
  }

  const boss = stages[bossIndex] as StageStats;
  return {
    runs,
    wins,
    winRate: wins / runs,
    deaths,
    stages,
    bossEmptyRate: boss.turns ? boss.emptyTurns / boss.turns : 0,
    bossWinHp: wins ? bossWinHpTotal / wins : 0,
  };
}

/** Binomial standard error of a rate measured over n independent samples. */
export function binomialStdErr(rate: number, n: number): number {
  return Math.sqrt((rate * (1 - rate)) / n);
}
