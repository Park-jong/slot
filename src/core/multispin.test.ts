// M2.5 multi-spin turns (m25-multispin-spec 2-5, 9, 10): the turn state machine, pooling, Focus, modifiers and
// every worked example of section 10. Product (M2.5) data unless a test says otherwise.
import { describe, expect, it } from 'vitest';
import { ACTIONS, createStartingBattleConfig, STANDARD_TIERS, type EnemyId } from '../data';
import {
  boardFromRows,
  deepFreeze,
  EMPTY_BOARD,
  reelFromNotation,
  scriptedRng,
  SINGLE_ATTACK_BOARD,
  SINGLE_GUARD_BOARD,
} from '../test-support/test-helpers';
import {
  createBattle,
  createBattleFromState,
  currentIntent,
  currentIntentPreview,
  isBattleOver,
  playTurn,
  previewStop,
  resolveTurn,
  spinOnce,
  stopSpinning,
  submitSpin,
  type Battle,
  type SpinResult,
  type TurnResult,
} from './battle';
import { estimateContinue } from './continue-estimate';
import type { TurnEvent } from './events';
import { power, selectTier } from './outcome';
import { createRng } from './rng';
import type { StopPreview } from './stop-preview';
import type { BattleConfig, BattleState, Board, TurnModifier } from './types';

const RNG_CALLS_PER_SPIN = 9;

const EXTRA_HAND: TurnModifier = { id: 'extra_hand', spinsPerTurnAdd: 1 };
const HEAVY_HAMMER: TurnModifier = { id: 'heavy_hammer', spinsPerTurnAdd: -1, damagePct: 130 };
const CALM_EYE: TurnModifier = { id: 'calm_eye', focusPctAdd: 25 };
const SINGLE_SPIN: TurnModifier = { id: 'single_spin', spinsPerTurnAdd: -2 };
const FIVE_SPINS: TurnModifier = { id: 'five_spins', spinsPerTurnAdd: 2 };

// Spec section 10 boards (rows top to bottom, each row reel 0, 1, 2).
const EMPTY_SPIN_BOARD = boardFromRows(['A1 G1 S1', 'G1 S1 A1', 'A1 A1 G1']);
const TOP_ATTACK_BOARD = boardFromRows(['A1 A1 A1', 'G1 S1 G1', 'S1 G1 S1']);

function configFor(enemyId: EnemyId, modifiers: readonly TurnModifier[] = []): BattleConfig {
  return { ...createStartingBattleConfig(enemyId), modifiers };
}

function battleAt(config: BattleConfig, overrides: Partial<BattleState> = {}): Battle {
  return createBattleFromState(config, { ...createBattle(config).state, ...overrides });
}

interface PlayedTurn {
  /** One SpinResult per submitted board. */
  readonly steps: readonly SpinResult[];
  /** previewStop right before stopping; null when the last spin reached the max. */
  readonly preview: StopPreview | null;
  readonly result: TurnResult;
}

/** Submits the boards in order, then stops unless the last one reached the max. Checks AC-2.6 on the way. */
function playSpins(battle: Battle, boards: readonly Board[]): PlayedTurn {
  const steps: SpinResult[] = [];
  let current = battle;
  for (const board of boards) {
    const step = submitSpin(current, board);
    steps.push(step);
    current = step.battle;
  }
  const last = steps.at(-1);
  if (last?.result) {
    return { steps, preview: null, result: last.result };
  }
  const preview = previewStop(current);
  const result = stopSpinning(current);
  expectPreviewMatches(preview, result);
  return { steps, preview, result };
}

/** AC-2.6: the preview equals what stopSpinning produced. */
function expectPreviewMatches(preview: StopPreview, { battle, report }: TurnResult): void {
  expect(preview.actions.map(({ actionId, lineCount, gradeSumTotal, multiplierNum, damage, guard, ignoreGuard }) => ({
    actionId,
    lineCount,
    gradeSumTotal,
    multiplierNum,
    damage,
    guard,
    ignoreGuard,
  }))).toEqual(
    report.outcomes.map(({ actionId, lineCount, gradeSumTotal, multiplierNum, damage, guard, ignoreGuard }) => ({
      actionId,
      lineCount,
      gradeSumTotal,
      multiplierNum,
      damage,
      guard,
      ignoreGuard,
    })),
  );
  expect(preview).toMatchObject({
    spinsUsed: report.spinsUsed,
    maxSpins: report.maxSpins,
    unusedSpins: report.unusedSpins,
    focusPct: report.focusPct,
    damagePct: report.damagePct,
    pooled: report.pooled,
    empty: report.empty,
    totalDamage: report.outcomes.reduce((sum, o) => sum + o.damage, 0),
    totalGuard: report.outcomes.reduce((sum, o) => sum + o.guard, 0),
    lethal: battle.state.phase === 'victory',
    playerHpAfterEnemy: battle.state.playerHp,
  });
}

/** Damage of a single fired line after `spinsUsed` spins (the line on spin 1, empty spins after). */
function valueAfter(config: BattleConfig, lineBoard: Board, spinsUsed: number): { damage: number; guard: number } {
  const boards = [lineBoard, ...Array.from({ length: spinsUsed - 1 }, () => EMPTY_BOARD)];
  const [outcome] = playSpins(createBattle(config), boards).result.report.outcomes;
  return { damage: outcome?.damage ?? 0, guard: outcome?.guard ?? 0 };
}

const eventTypes = (events: readonly TurnEvent[]) => events.map((event) => event.type);

describe('turn state machine (spec 2.1-2.4)', () => {
  const SLIME = configFor('slime');

  it('AC-2.1: a new battle is at turn_start with 3 spins, Focus 50, damagePct 0', () => {
    expect(createBattle(SLIME).session).toEqual({ kind: 'turn_start', stats: { maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 } });
  });

  it('AC-2.3: spins 1 and 2 leave HP and guard unchanged; spin 3 resolves with max_reached', () => {
    const rng = createRng(11);
    const start = createBattle(SLIME);
    const first = spinOnce(start, rng);
    const second = spinOnce(first.battle, rng);
    for (const step of [first, second]) {
      expect(step.result).toBeNull();
      expect(step.battle.state).toEqual(start.state);
    }
    expect(second.battle.session).toMatchObject({ kind: 'spinning', spins: [{ index: 1 }, { index: 2 }] });
    const third = spinOnce(second.battle, rng);
    expect(third.result?.report).toMatchObject({ stopReason: 'max_reached', spinsUsed: 3, unusedSpins: 0, focusPct: 0 });
    expect(third.spin).toMatchObject({ index: 3, maxSpins: 3 });
    expect(third.battle.state.turn).toBe(2);
    expect(third.battle.session).toEqual({ kind: 'turn_start', stats: { maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 } });
  });

  it('AC-2.4: spinOnce draws exactly 9 rng values; stopSpinning and previewStop draw none', () => {
    const rng = scriptedRng(Array.from({ length: RNG_CALLS_PER_SPIN * 2 }, () => 0.5));
    const first = spinOnce(createBattle(SLIME), rng);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN);
    const second = spinOnce(first.battle, rng);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN * 2);
    previewStop(second.battle);
    stopSpinning(second.battle);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN * 2);
  });

  it('spinOnce draws the board exactly like spin(): reel 0 first, rows 0, 1, 2', () => {
    // Reels are A A A G G S S; 0 always takes the first remaining symbol, 0.99 the last.
    const rng = scriptedRng([0, 0, 0, 0.99, 0.99, 0.99, 0, 0.99, 0]);
    const { spin } = spinOnce(createBattle(SLIME), rng);
    expect(spin.board.map((column) => column.map((symbol) => symbol.actionId))).toEqual([
      ['attack', 'attack', 'attack'],
      ['shield_bash', 'shield_bash', 'guard'],
      ['attack', 'shield_bash', 'attack'],
    ]);
  });

  it('AC-2.5: with an effective max of 1, one spinOnce resolves (unused 0, Focus 0, max_reached)', () => {
    const rng = createRng(4);
    const step = spinOnce(createBattle(configFor('slime', [SINGLE_SPIN])), rng);
    expect(step.result?.report).toMatchObject({ maxSpins: 1, spinsUsed: 1, unusedSpins: 0, focusPct: 0, stopReason: 'max_reached' });
    expect(step.events.find((event) => event.type === 'spin_phase_ended')).toEqual({
      type: 'spin_phase_ended',
      spinsUsed: 1,
      unusedSpins: 0,
      focusPct: 0,
      reason: 'max_reached',
    });
  });

  it('AC-2.7: events are turn_started, player_guard_expired, spun..., spin_phase_ended, then the settlement', () => {
    const start = battleAt(SLIME, { playerGuard: 4 });
    const first = submitSpin(start, SINGLE_ATTACK_BOARD);
    expect(first.events).toEqual([
      { type: 'turn_started', turn: 1, maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 },
      { type: 'player_guard_expired', amount: 4 },
      { type: 'spun', spinIndex: 1, maxSpins: 3, firedLines: [{ lineId: 'H1', actionId: 'attack', gradeSum: 3 }], empty: false },
    ]);
    expect(first.battle.state.playerGuard).toBe(0);
    const second = submitSpin(first.battle, EMPTY_BOARD);
    expect(second.events).toEqual([{ type: 'spun', spinIndex: 2, maxSpins: 3, firedLines: [], empty: true }]);
    const { report } = stopSpinning(second.battle);
    expect(eventTypes(report.turnEvents)).toEqual([
      'turn_started',
      'player_guard_expired',
      'spun',
      'spun',
      'spin_phase_ended',
      'enemy_damaged',
      'enemy_attacked',
    ]);
    expect(report.events.map((event) => event.type)).toEqual(['player_guard_expired', 'enemy_damaged', 'enemy_attacked']);
    expect(report.before.playerGuard).toBe(4);
  });

  it('auto-resolving spin returns the spin events followed by the settlement events', () => {
    const { steps } = playSpins(createBattle(SLIME), [EMPTY_BOARD, EMPTY_BOARD, SINGLE_GUARD_BOARD]);
    expect(eventTypes(steps[2]?.events ?? [])).toEqual(['spun', 'spin_phase_ended', 'player_guard_gained', 'enemy_attacked']);
    expect(steps[2]?.result?.report.turnEvents).toHaveLength(1 + 3 + 1 + 2);
  });

  it('AC-2.8 / AC-9.1: an empty turn has only the enemy action and report.empty', () => {
    const { result } = playSpins(createBattle(SLIME), [EMPTY_BOARD]);
    expect(result.report).toMatchObject({ empty: true, outcomes: [] });
    expect(result.report.events).toEqual([
      { type: 'enemy_attacked', value: 6, baseValue: 6, absorbed: 0, hpLoss: 6, playerHp: 44, playerGuard: 0 },
    ]);
    expect(result.battle.state.enemyHp).toBe(72);
  });

  it('resolveTurn = one board, then stop: unused spins count for Focus', () => {
    const { report } = resolveTurn(createBattle(SLIME), SINGLE_ATTACK_BOARD);
    expect(report).toMatchObject({ spinsUsed: 1, unusedSpins: 2, focusPct: 100, stopReason: 'player_stop' });
    expect(report.outcomes[0]?.damage).toBe(12);
    expect(report.board).toEqual(SINGLE_ATTACK_BOARD);
    expect(report.judgement).toEqual(report.pooled);
  });

  it('playTurn spins while the policy says so; the default stops after one spin', () => {
    const always = playTurn(createBattle(SLIME), createRng(2), () => true);
    expect(always.report).toMatchObject({ spinsUsed: 3, stopReason: 'max_reached' });
    const once = playTurn(createBattle(SLIME), createRng(2));
    expect(once.report).toMatchObject({ spinsUsed: 1, unusedSpins: 2, stopReason: 'player_stop' });

    const seen: number[] = [];
    const twice = playTurn(createBattle(SLIME), createRng(2), (preview, battle) => {
      seen.push(preview.spinsUsed);
      expect(battle.session?.kind).toBe('spinning');
      return preview.spinsUsed < 2;
    });
    expect(seen).toEqual([1, 2]);
    expect(twice.report).toMatchObject({ spinsUsed: 2, unusedSpins: 1, focusPct: 50, stopReason: 'player_stop' });
    // Same rng seed: the first spin is the same board whatever the policy.
    expect(twice.report.spins[0]?.board).toEqual(once.report.spins[0]?.board);
  });

  it('playTurn draws 9 rng values per spin taken and nothing for skipped spins', () => {
    const rng = scriptedRng(Array.from({ length: RNG_CALLS_PER_SPIN * 2 }, () => 0.3));
    playTurn(createBattle(SLIME), rng, (preview) => preview.spinsUsed < 2);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN * 2);
  });

  it('report.spins lists every spin with its own lines; pooled lines carry spinIndex', () => {
    const { result } = playSpins(createBattle(SLIME), [SINGLE_ATTACK_BOARD, EMPTY_BOARD]);
    const { spins, pooled } = result.report;
    expect(spins.map(({ index, maxSpins, empty, judgement }) => [index, maxSpins, empty, judgement.firedLines.length])).toEqual([
      [1, 3, false, 1],
      [2, 3, true, 0],
    ]);
    expect(pooled.firedLines).toEqual([{ lineId: 'H1', actionId: 'attack', gradeSum: 3, cells: expect.any(Array), spinIndex: 1 }]);
  });

  it('never mutates the input battle across spins and stops', () => {
    const start = deepFreeze(createBattle(SLIME));
    const snapshot = structuredClone(start);
    const first = deepFreeze(submitSpin(start, SINGLE_ATTACK_BOARD).battle);
    const firstSnapshot = structuredClone(first);
    previewStop(first);
    stopSpinning(first);
    submitSpin(first, EMPTY_BOARD);
    expect(start).toEqual(snapshot);
    expect(first).toEqual(firstSnapshot);
  });
});

describe('illegal calls (spec 2.2, example 12)', () => {
  const SLIME = configFor('slime');
  const turnStart = deepFreeze(createBattle(SLIME));
  const spinning = deepFreeze(submitSpin(turnStart, SINGLE_ATTACK_BOARD).battle);
  const ended = deepFreeze(resolveTurn(battleAt(SLIME, { enemyHp: 1 }), SINGLE_ATTACK_BOARD).battle);

  it('the ended battle has phase victory and no session', () => {
    expect(ended.state.phase).toBe('victory');
    expect(ended.session).toBeNull();
  });

  it('turn_start: stopSpinning and previewStop throw (no spin yet)', () => {
    expect(() => stopSpinning(turnStart)).toThrow(/stopSpinning.*turn_start/);
    expect(() => previewStop(turnStart)).toThrow(/previewStop.*turn_start/);
    expect(() => estimateContinue(turnStart, { rng: createRng(1), samples: 1 })).toThrow(/turn_start/);
  });

  it('spinning: playTurn and resolveTurn throw (turn in progress)', () => {
    expect(() => playTurn(spinning, createRng(1))).toThrow(/playTurn.*spinning/);
    expect(() => resolveTurn(spinning, EMPTY_BOARD)).toThrow(/resolveTurn.*spinning/);
  });

  it('battle ended: every turn call throws', () => {
    expect(() => spinOnce(ended, createRng(1))).toThrow(/spinOnce.*ended/);
    expect(() => submitSpin(ended, EMPTY_BOARD)).toThrow(/submitSpin.*ended/);
    expect(() => stopSpinning(ended)).toThrow(/stopSpinning.*ended/);
    expect(() => previewStop(ended)).toThrow(/previewStop.*ended/);
    expect(() => playTurn(ended, createRng(1))).toThrow(/playTurn.*ended/);
    expect(() => resolveTurn(ended, EMPTY_BOARD)).toThrow(/resolveTurn.*ended/);
  });

  it('intent and end queries are legal in every state', () => {
    for (const battle of [turnStart, spinning, ended]) {
      expect(() => currentIntent(battle)).not.toThrow();
      expect(() => currentIntentPreview(battle)).not.toThrow();
    }
    expect([turnStart, spinning, ended].map(isBattleOver)).toEqual([false, false, true]);
    expect(currentIntentPreview(spinning)).toEqual(currentIntentPreview(turnStart));
  });

  it('legal calls in each state succeed', () => {
    expect(submitSpin(spinning, EMPTY_BOARD).battle.session?.kind).toBe('spinning');
    expect(() => stopSpinning(spinning)).not.toThrow();
    expect(() => spinOnce(turnStart, createRng(1))).not.toThrow();
    expect(() => playTurn(turnStart, createRng(1))).not.toThrow();
  });

  it('three spinOnce calls resolve on the third; a fourth is spin 1 of the next turn', () => {
    const rng = createRng(8);
    let step = spinOnce(turnStart, rng);
    step = spinOnce(step.battle, rng);
    step = spinOnce(step.battle, rng);
    expect(step.result).not.toBeNull();
    const fourth = spinOnce(step.battle, rng);
    expect(fourth.spin.index).toBe(1);
    expect(fourth.events[0]).toMatchObject({ type: 'turn_started', turn: 2 });
  });

  it('submitSpin rejects boards of the wrong shape, unknown actions and unknown grades', () => {
    const twoReels = SINGLE_ATTACK_BOARD.slice(0, 2);
    const fourRows = SINGLE_ATTACK_BOARD.map((column) => [...column, column[0]!]);
    expect(() => submitSpin(turnStart, twoReels)).toThrow(/submitSpin: board must be 3 reels x 3 rows/);
    expect(() => submitSpin(turnStart, fourRows)).toThrow(/3 reels x 3 rows/);
    expect(() => submitSpin(turnStart, boardFromRows(['P1 P1 P1', 'A1 G1 A1', 'G1 A1 G1']))).toThrow(/unknown actions poke/);
    expect(() => submitSpin(turnStart, boardFromRows(['A9 A1 A1', 'A1 G1 A1', 'G1 A1 G1']))).toThrow(/unknown grade 9/);
  });
});

describe('createBattleFromState session checks (spec 2.4)', () => {
  const SLIME = configFor('slime');
  const start = createBattle(SLIME);
  const spinning = submitSpin(start, SINGLE_ATTACK_BOARD).battle;
  const session = spinning.session;
  if (session?.kind !== 'spinning') throw new Error('expected a spinning session');
  const [firstSpin] = session.spins;
  if (!firstSpin) throw new Error('expected a spin');

  it('without a session an ongoing battle starts at turn_start and an ended one gets null', () => {
    expect(createBattleFromState(SLIME, start.state).session?.kind).toBe('turn_start');
    expect(createBattleFromState(SLIME, { ...start.state, phase: 'victory' }).session).toBeNull();
  });

  it('keeps a valid spinning session as is', () => {
    expect(createBattleFromState(SLIME, spinning.state, session)).toEqual(spinning);
  });

  it('example 12: a spinning session with spinsUsed == maxSpins throws', () => {
    const full = { ...session, spins: [firstSpin, { ...firstSpin, index: 2 }, { ...firstSpin, index: 3 }] };
    expect(() => createBattleFromState(SLIME, spinning.state, full)).toThrow(/3 spins, allowed 1..2/);
  });

  it('zero spins, non-consecutive indices and a session/phase mismatch throw', () => {
    expect(() => createBattleFromState(SLIME, spinning.state, { ...session, spins: [] })).toThrow(/0 spins/);
    expect(() => createBattleFromState(SLIME, spinning.state, { ...session, spins: [{ ...firstSpin, index: 2 }] })).toThrow(
      /indices/,
    );
    expect(() => createBattleFromState(SLIME, start.state, null)).toThrow(/does not match battle phase ongoing/);
    expect(() => createBattleFromState(SLIME, { ...start.state, phase: 'defeat' }, start.session)).toThrow(/defeat/);
  });
});

describe('pooling (spec 3)', () => {
  const OGRE = configFor('ogre');
  const OGRE_FIVE = configFor('ogre', [FIVE_SPINS]);

  it('AC-3.1: the same line id firing in two spins counts twice', () => {
    const { result } = playSpins(createBattle(OGRE), [SINGLE_ATTACK_BOARD, SINGLE_ATTACK_BOARD]);
    expect(result.report.pooled.byAction['attack']).toMatchObject({ lineCount: 2, gradeSumTotal: 6 });
    expect(result.report.pooled.firedLines.map((line) => [line.lineId, line.spinIndex])).toEqual([
      ['H1', 1],
      ['H1', 2],
    ]);
    // x1.5, unused 1 (+50%): floor(2 x 6 x 3 x 150 / 200) = 27.
    expect(result.report.outcomes[0]).toMatchObject({ multiplierNum: 3, damage: 27, focusPct: 50, damagePct: 0 });
  });

  it('AC-3.2: pooled attack lines 1..5 give multiplierNum 2/3/4/4/4', () => {
    const multipliers = [1, 2, 3, 4, 5].map((lines) => {
      const boards = Array.from({ length: lines }, () => SINGLE_ATTACK_BOARD);
      return playSpins(createBattle(OGRE_FIVE), boards).result.report.outcomes[0]?.multiplierNum;
    });
    expect(multipliers).toEqual([2, 3, 4, 4, 4]);
    expect([1, 2, 3, 4, 5, 8, 40].map((n) => selectTier(STANDARD_TIERS, n).multiplierNum)).toEqual([2, 3, 4, 4, 4, 4, 4]);
  });

  it('AC-3.5: one floor over the pooled total, not per spin', () => {
    const skillBoard = boardFromRows(['S1 S1 S1', 'A1 G1 A1', 'G1 A1 G1']);
    const { result } = playSpins(createBattle(OGRE), [skillBoard, skillBoard]);
    // floor(1 x 6 x 3 x 150 / 200) = floor(13.5) = 13; per-spin floors would give 6 + 6 = 12.
    expect(result.report.outcomes[0]).toMatchObject({ actionId: 'shield_bash', damage: 13, guard: 13 });
    expect(power(1, 3, 3, 50) * 2).toBe(12);
  });

  it('AC-3.6: duplicate (id, minLines) effects are still rejected with the M2.5 actions', () => {
    const duplicated = ACTIONS.map((action) =>
      action.id === 'attack'
        ? { ...action, effects: [...action.effects, { id: 'weaken', minLines: 3, params: {}, deferred: true }] }
        : action,
    );
    expect(() => createBattle({ ...OGRE, actions: duplicated })).toThrow(/effect weaken at minLines 3 twice/);
  });

  it('AC-9.3: some empty spins but a non-zero pool is not an empty turn', () => {
    const { result } = playSpins(createBattle(OGRE), [EMPTY_BOARD, SINGLE_GUARD_BOARD]);
    expect(result.report.empty).toBe(false);
    expect(result.report.spins.map((spin) => spin.empty)).toEqual([true, false]);
  });
});

describe('Focus and damagePct (spec 4, AC-4.x)', () => {
  const OGRE = configFor('ogre');

  it('AC-4.1 / AC-4.2: one attack line 12 / 9 / 6 and one guard line 12 / 9 / 6 after 1 / 2 / 3 spins', () => {
    expect([1, 2, 3].map((spins) => valueAfter(OGRE, SINGLE_ATTACK_BOARD, spins).damage)).toEqual([12, 9, 6]);
    expect([1, 2, 3].map((spins) => valueAfter(OGRE, SINGLE_GUARD_BOARD, spins).guard)).toEqual([12, 9, 6]);
  });

  it('AC-4.3 / AC-5.6: damagePct +130 with max 2 gives attack 16 but guard only 9 after one spin', () => {
    const config = configFor('ogre', [{ id: 'damage_only', spinsPerTurnAdd: -1, damagePct: 130 }]);
    expect(valueAfter(config, SINGLE_ATTACK_BOARD, 1).damage).toBe(16);
    expect(valueAfter(config, SINGLE_GUARD_BOARD, 1).guard).toBe(9);
  });

  it('AC-4.4: an empty pool stays empty whatever the unused spins', () => {
    const start = createBattle(OGRE);
    const { result } = playSpins(start, [EMPTY_BOARD]);
    expect(result.report).toMatchObject({ unusedSpins: 2, focusPct: 100, outcomes: [], empty: true });
    expect(result.battle.state.enemyHp).toBe(start.state.enemyHp);
  });

  it('AC-4.6: focusPct = focusPctPerUnused x unusedSpins, recorded on the report and the outcomes', () => {
    const { result } = playSpins(createBattle(configFor('ogre', [CALM_EYE])), [SINGLE_ATTACK_BOARD]);
    expect(result.report).toMatchObject({ focusPct: 150, damagePct: 0, maxSpins: 3, spinsUsed: 1 });
    expect(result.report.outcomes[0]).toMatchObject({ focusPct: 150, damagePct: 0 });
  });

  it('the percent never goes below 0 (spec 4.1 clamp)', () => {
    const config = configFor('ogre', [{ id: 'cursed', damagePct: -300 }]);
    expect(valueAfter(config, SINGLE_ATTACK_BOARD, 3).damage).toBe(0);
    expect(power(2, 3, 2, -300)).toBe(0);
  });
});

describe('spin count modifiers (spec 5, AC-5.x, example 13)', () => {
  it('AC-5.2: { spinsPerTurnAdd: 1 } gives maxSpins 4 and resolves on the 4th spin', () => {
    const start = createBattle(configFor('ogre', [EXTRA_HAND]));
    expect(start.session?.stats.maxSpins).toBe(4);
    const { steps } = playSpins(start, [EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD]);
    expect(steps.map((step) => step.result !== null)).toEqual([false, false, false, true]);
    expect(steps[3]?.result?.report.stopReason).toBe('max_reached');
  });

  it('example 13: one attack line under each example item (1, 2, 3, 4 spins used)', () => {
    const damages = (modifiers: readonly TurnModifier[], spins: readonly number[]) =>
      spins.map((count) => valueAfter(configFor('ogre', modifiers), SINGLE_ATTACK_BOARD, count).damage);
    expect(damages([], [1, 2, 3])).toEqual([12, 9, 6]);
    expect(damages([EXTRA_HAND], [1, 2, 3, 4])).toEqual([15, 12, 9, 6]);
    expect(damages([HEAVY_HAMMER], [1, 2])).toEqual([16, 13]);
    expect(damages([CALM_EYE], [1, 2, 3])).toEqual([15, 10, 6]);
  });

  it('example 13: one guard line, base 12 / 9 / 6 and heavy hammer 9 / 6 (damagePct never applies to guard)', () => {
    const guards = (modifiers: readonly TurnModifier[], spins: readonly number[]) =>
      spins.map((count) => valueAfter(configFor('ogre', modifiers), SINGLE_GUARD_BOARD, count).guard);
    expect(guards([], [1, 2, 3])).toEqual([12, 9, 6]);
    expect(guards([HEAVY_HAMMER], [1, 2])).toEqual([9, 6]);
  });

  it('AC-5.5: stats stay fixed during a turn and change only at the next turn start', () => {
    const plain = configFor('ogre');
    const spinning = submitSpin(createBattle(plain), SINGLE_ATTACK_BOARD).battle;
    const withItem = { ...plain, modifiers: [EXTRA_HAND] };
    const moved = createBattleFromState(withItem, spinning.state, spinning.session);
    expect(moved.session?.stats.maxSpins).toBe(3);
    const second = submitSpin(moved, EMPTY_BOARD);
    expect(second.result).toBeNull();
    const third = submitSpin(second.battle, EMPTY_BOARD);
    expect(third.result?.report).toMatchObject({ maxSpins: 3, stopReason: 'max_reached' });
    expect(third.battle.session?.stats.maxSpins).toBe(4);
  });

  it('AC-5.7: validateBattleConfig rejects non-integer modifiers and bad spin settings', () => {
    const base = configFor('slime');
    expect(() => createBattle({ ...base, modifiers: [{ id: 'bad', spinsPerTurnAdd: 0.5 }] })).toThrow(/spinsPerTurnAdd/);
    expect(() => createBattle({ ...base, modifiers: [{ id: 'bad', damagePct: 2.5 }] })).toThrow(/damagePct/);
    expect(() => createBattle({ ...base, modifiers: [{ id: 'bad', spinsPerTurnMulPct: -1 }] })).toThrow(/spinsPerTurnMulPct/);
    expect(() => createBattle({ ...base, character: { ...base.character, spinsPerTurn: 0 } })).toThrow(/spinsPerTurn 0/);
    expect(() => createBattle({ ...base, character: { ...base.character, spinsPerTurn: 6 } })).toThrow(/spinsPerTurn 6/);
    expect(() => createBattle({ ...base, character: { ...base.character, spinsPerTurn: 2.5 } })).toThrow(/spinsPerTurn 2.5/);
    expect(() => createBattle({ ...base, turnRules: { ...base.turnRules, spinsPerTurnMin: 0 } })).toThrow(/spinsPerTurnMin/);
    expect(() => createBattle({ ...base, turnRules: { ...base.turnRules, spinsPerTurnHardCap: 2 } })).toThrow(/spinsPerTurn/);
    expect(() => createBattle({ ...base, turnRules: { ...base.turnRules, focusPercentPerUnusedSpin: -5 } })).toThrow(
      /focusPercentPerUnusedSpin/,
    );
  });

  it('AC-6.4: tier tables must start at 1 line without duplicates; 3+ lines select {3:4}', () => {
    const withTiers = (tiers: BattleConfig['actions'][number]['tiers']) =>
      ({ ...configFor('slime'), actions: ACTIONS.map((action) => ({ ...action, tiers })) }) satisfies BattleConfig;
    expect(() => createBattle(withTiers([{ lineCount: 2, multiplierNum: 3 }]))).toThrow(/must start at 1 line/);
    expect(() =>
      createBattle(withTiers([{ lineCount: 1, multiplierNum: 2 }, { lineCount: 1, multiplierNum: 3 }])),
    ).toThrow(/unique integers/);
    expect(selectTier(STANDARD_TIERS, 3)).toEqual({ lineCount: 3, multiplierNum: 4 });
    expect(selectTier(STANDARD_TIERS, 7)).toEqual({ lineCount: 3, multiplierNum: 4 });
  });
});

describe('previewStop details (spec 2.6)', () => {
  it('lists next tier and next executed effect thresholds; null and [] at the last tier', () => {
    const skeleton = battleAt(configFor('skeleton'), { enemyHp: 95, enemyGuard: 18, playerHp: 30, enemyActionIndex: 1 });
    const twoLines = submitSpin(skeleton, boardFromRows(['A1 A1 A2', 'A1 S1 G1', 'A1 G1 S1'])).battle;
    expect(previewStop(twoLines)).toMatchObject({
      actions: [
        {
          actionId: 'attack',
          lineCount: 2,
          gradeSumTotal: 7,
          multiplierNum: 3,
          nextTierAt: 3,
          nextEffects: [{ id: 'ignore_guard', minLines: 3 }],
          // floor(2 x 7 x 3 x 200 / 200) = 42, of which the enemy guard absorbs 18.
          damage: 42,
          ignoreGuard: false,
        },
      ],
      incoming: 12,
      lethal: false,
      playerHpAfterEnemy: 18,
    });
    const threeLines = submitSpin(twoLines, boardFromRows(['S1 A1 G1', 'A1 A1 A1', 'G1 S1 S1'])).battle;
    expect(previewStop(threeLines).actions[0]).toMatchObject({ lineCount: 3, multiplierNum: 4, nextTierAt: null, nextEffects: [] });
  });

  it('incoming is 0 for guard and charge intents and the charged value for a boosted attack', () => {
    const ogre = configFor('ogre');
    const incomingAt = (overrides: Partial<BattleState>) =>
      previewStop(submitSpin(battleAt(ogre, overrides), EMPTY_BOARD).battle).incoming;
    expect(incomingAt({ enemyActionIndex: 0 })).toBe(9);
    expect(incomingAt({ enemyActionIndex: 1 })).toBe(0);
    expect(incomingAt({ enemyActionIndex: 2, enemyChargeMult: 2 })).toBe(18);
    expect(incomingAt({ enemyActionIndex: 3 })).toBe(0);
  });

  it('empty preview says nothing happens but still shows the enemy hit', () => {
    const preview = previewStop(submitSpin(createBattle(configFor('slime')), EMPTY_BOARD).battle);
    expect(preview).toMatchObject({ empty: true, actions: [], totalDamage: 0, totalGuard: 0, lethal: false, playerHpAfterEnemy: 44 });
  });
});

describe('estimateContinue (spec 2.6, P2)', () => {
  it('uses its own rng only and never changes the battle', () => {
    const spinning = deepFreeze(submitSpin(createBattle(configFor('slime')), SINGLE_ATTACK_BOARD).battle);
    const snapshot = structuredClone(spinning);
    const first = estimateContinue(spinning, { rng: createRng(3), samples: 200 });
    const again = estimateContinue(spinning, { rng: createRng(3), samples: 200 });
    expect(first).toEqual(again);
    expect(first.samples).toBe(200);
    expect(spinning).toEqual(snapshot);
    const rng = scriptedRng(Array.from({ length: RNG_CALLS_PER_SPIN * 4 }, () => 0.4));
    estimateContinue(spinning, { rng, samples: 4 });
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN * 4);
  });

  it('averages "spin exactly once more, then stop" (deterministic reels)', () => {
    // Every reel is A A A, so each spin fires all 8 lines with grade sum 3: after two spins 16 lines, sum 48,
    // x2, one unused spin (+50%): floor(2 x 48 x 4 x 150 / 200) = 288.
    const reels = Array.from({ length: 3 }, () => reelFromNotation('A1 A1 A1'));
    const config = { ...configFor('ogre'), reels };
    const spinning = spinOnce(createBattle(config), createRng(1)).battle;
    expect(estimateContinue(spinning, { rng: createRng(9), samples: 3 })).toEqual({
      samples: 3,
      averageDamage: 288,
      averageGuard: 0,
      lethalChance: 0,
    });
  });

  it('rejects a non-positive or non-integer sample count', () => {
    const spinning = submitSpin(createBattle(configFor('slime')), EMPTY_BOARD).battle;
    expect(() => estimateContinue(spinning, { rng: createRng(1), samples: 0 })).toThrow(/samples 0/);
    expect(() => estimateContinue(spinning, { rng: createRng(1), samples: 1.5 })).toThrow(/samples 1.5/);
  });
});

describe('spec section 10 worked examples (each also checks previewStop == stopSpinning)', () => {
  it('example 1: stop after spin 1 (Focus +100%); guard 12 absorbs the slime attack 6', () => {
    const start = battleAt(configFor('slime'), { enemyHp: 72, playerHp: 50 });
    const { result, preview } = playSpins(start, [boardFromRows(['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1'])]);
    expect(result.report).toMatchObject({ spinsUsed: 1, unusedSpins: 2, focusPct: 100, stopReason: 'player_stop' });
    expect(result.report.outcomes.map((o) => [o.actionId, o.lineCount, o.gradeSumTotal, o.damage, o.guard])).toEqual([
      ['guard', 1, 3, 0, 12],
      ['attack', 1, 3, 12, 0],
    ]);
    expect(result.report.events.at(-1)).toEqual({
      type: 'enemy_attacked',
      value: 6,
      baseValue: 6,
      absorbed: 6,
      hpLoss: 0,
      playerHp: 50,
      playerGuard: 6,
    });
    expect(result.battle.state).toMatchObject({ enemyHp: 60, playerHp: 50, playerGuard: 6 });
    expect(preview?.incoming).toBe(6);
  });

  it('example 2: pooled attack 3 lines across spins -> x2 and ignore_guard (60 damage, guard 18 untouched)', () => {
    const start = battleAt(configFor('skeleton'), { enemyHp: 95, enemyGuard: 18, playerHp: 30, enemyActionIndex: 1 });
    const { result } = playSpins(start, [
      boardFromRows(['A1 A1 A2', 'A1 S1 G1', 'A1 G1 S1']),
      boardFromRows(['S1 A1 G1', 'A1 A1 A1', 'G1 S1 S1']),
    ]);
    expect(result.report.pooled.firedLines.map((line) => [line.spinIndex, line.lineId, line.gradeSum])).toEqual([
      [1, 'H1', 4],
      [1, 'V1', 3],
      [2, 'H2', 3],
    ]);
    expect(result.report).toMatchObject({ unusedSpins: 1, focusPct: 50 });
    expect(result.report.outcomes).toEqual([
      { actionId: 'attack', lineCount: 3, gradeSumTotal: 10, multiplierNum: 4, damage: 60, guard: 0, ignoreGuard: true, focusPct: 50, damagePct: 0 },
    ]);
    expect(result.report.events[0]).toMatchObject({ type: 'enemy_damaged', damage: 60, absorbed: 0, hpLoss: 60, ignoreGuard: true, enemyHp: 35, enemyGuard: 18 });
    expect(result.battle.state).toMatchObject({ enemyHp: 35, playerHp: 18 });
  });

  it('example 3: all 3 spins, first empty; boosted ogre attack 18 against guard 9', () => {
    const start = battleAt(configFor('ogre'), { enemyHp: 200, playerHp: 40, enemyActionIndex: 2, enemyChargeMult: 2 });
    const { steps, preview, result } = playSpins(start, [
      EMPTY_SPIN_BOARD,
      boardFromRows(['S1 S1 S1', 'A1 G1 A1', 'A1 A1 A1']),
      boardFromRows(['G1 G1 G1', 'A2 A1 A1', 'S1 S1 G1']),
    ]);
    expect(preview).toBeNull();
    expect(steps.map((step) => step.spin.empty)).toEqual([true, false, false]);
    expect(result.report).toMatchObject({ spinsUsed: 3, unusedSpins: 0, focusPct: 0, stopReason: 'max_reached', empty: false });
    expect(result.report.outcomes.map((o) => [o.actionId, o.lineCount, o.gradeSumTotal, o.multiplierNum, o.damage, o.guard])).toEqual([
      ['guard', 1, 3, 2, 0, 6],
      ['shield_bash', 1, 3, 2, 3, 3],
      ['attack', 2, 7, 3, 21, 0],
    ]);
    expect(result.report.events.at(-1)).toMatchObject({ type: 'enemy_attacked', value: 18, baseValue: 9, absorbed: 9, hpLoss: 9, playerHp: 31 });
    expect(result.battle.state).toMatchObject({ enemyHp: 176, playerHp: 31, enemyChargeMult: 1 });
  });

  it('example 4: three empty spins -> empty turn, no substitute action, goblin hits 10', () => {
    const start = battleAt(configFor('goblin_young'), { enemyHp: 50, playerHp: 25, enemyActionIndex: 1 });
    const lastBoard = boardFromRows(['S1 A1 G1', 'G1 A1 S1', 'A1 G1 A1']);
    const { result } = playSpins(start, [EMPTY_SPIN_BOARD, EMPTY_SPIN_BOARD, lastBoard]);
    expect(result.report).toMatchObject({ empty: true, outcomes: [], spinsUsed: 3, stopReason: 'max_reached' });
    expect(result.report.events).toEqual([
      { type: 'enemy_attacked', value: 10, baseValue: 10, absorbed: 0, hpLoss: 10, playerHp: 15, playerGuard: 0 },
    ]);
    expect(result.battle.state).toMatchObject({ enemyHp: 50, playerHp: 15 });
  });

  it('example 4b: stopping after an empty first spin is legal and gives the same result', () => {
    const start = battleAt(configFor('goblin_young'), { enemyHp: 50, playerHp: 25, enemyActionIndex: 1 });
    const { result } = playSpins(start, [EMPTY_SPIN_BOARD]);
    expect(result.report).toMatchObject({ empty: true, outcomes: [], unusedSpins: 2, stopReason: 'player_stop' });
    expect(result.battle.state).toMatchObject({ enemyHp: 50, playerHp: 15 });
  });

  it('example 5: lethal early stop; the slime never acts', () => {
    const start = battleAt(configFor('slime'), { enemyHp: 30, playerHp: 50 });
    const board = boardFromRows(['A1 A1 A1', 'G1 S1 G1', 'A1 A1 A2']);
    const spinning = submitSpin(start, board).battle;
    expect(previewStop(spinning)).toMatchObject({ lethal: true, totalDamage: 42, playerHpAfterEnemy: 50 });
    const { result } = playSpins(start, [board]);
    expect(result.report.outcomes[0]).toMatchObject({ lineCount: 2, gradeSumTotal: 7, multiplierNum: 3, damage: 42, ignoreGuard: false });
    expect(result.battle.state).toMatchObject({ enemyHp: -12, playerHp: 50, phase: 'victory' });
    expect(result.battle.session).toBeNull();
    expect(result.report.events.at(-1)).toEqual({ type: 'victory' });
    expect(result.report.events.some((event) => event.type === 'enemy_attacked')).toBe(false);
  });

  it('example 6: effective max 1 resolves on spinOnce/submitSpin; same as the M2 one-spin rule', () => {
    for (const config of [
      configFor('goblin_young', [SINGLE_SPIN]),
      { ...configFor('goblin_young'), character: { ...configFor('goblin_young').character, spinsPerTurn: 1 } },
    ]) {
      const start = battleAt(config, { enemyHp: 81, playerHp: 40 });
      const step = submitSpin(start, TOP_ATTACK_BOARD);
      expect(step.result?.report).toMatchObject({ stopReason: 'max_reached', unusedSpins: 0, focusPct: 0, maxSpins: 1 });
      expect(step.result?.report.outcomes[0]?.damage).toBe(6);
      expect(step.result?.battle.state).toMatchObject({ enemyHp: 75, playerHp: 35 });
      expect(resolveTurn(start, TOP_ATTACK_BOARD)).toEqual(step.result);
    }
  });

  it('example 7: effective max 4, stop after 3 (Focus +50%): guard 9 and attack 9', () => {
    const start = battleAt(configFor('goblin', [EXTRA_HAND]), { enemyHp: 102, playerHp: 40, enemyActionIndex: 1 });
    const { result } = playSpins(start, [TOP_ATTACK_BOARD, SINGLE_GUARD_BOARD, EMPTY_SPIN_BOARD]);
    expect(result.report).toMatchObject({ maxSpins: 4, spinsUsed: 3, unusedSpins: 1, focusPct: 50 });
    expect(result.report.outcomes.map((o) => [o.actionId, o.damage, o.guard])).toEqual([
      ['guard', 0, 9],
      ['attack', 9, 0],
    ]);
    expect(result.report.events.at(-1)).toMatchObject({ type: 'enemy_attacked', value: 10, absorbed: 9, hpLoss: 1 });
    expect(result.battle.state).toMatchObject({ enemyHp: 93, playerHp: 39 });
  });

  it('example 8: Focus and floor applied once (21, not 20)', () => {
    const start = battleAt(configFor('goblin'), { enemyHp: 102, playerHp: 40 });
    const { result } = playSpins(start, [boardFromRows(['S1 S1 S2', 'A1 G1 A1', 'S1 S1 S1'])]);
    expect(result.report.outcomes).toEqual([
      { actionId: 'shield_bash', lineCount: 2, gradeSumTotal: 7, multiplierNum: 3, damage: 21, guard: 21, ignoreGuard: false, focusPct: 100, damagePct: 0 },
    ]);
    expect(power(1, 7, 3) * 2).toBe(20);
    expect(result.battle.state).toMatchObject({ enemyHp: 81, playerHp: 40, playerGuard: 15 });
  });

  it('example 9: stop because the guard is enough (12 absorbs the goblin 10)', () => {
    const start = battleAt(configFor('goblin'), { enemyHp: 102, playerHp: 20, enemyActionIndex: 1 });
    const { result } = playSpins(start, [SINGLE_GUARD_BOARD]);
    expect(result.report.outcomes.map((o) => [o.actionId, o.damage, o.guard])).toEqual([['guard', 0, 12]]);
    expect(result.report.events.at(-1)).toMatchObject({ type: 'enemy_attacked', value: 10, absorbed: 10, hpLoss: 0, playerHp: 20 });
    expect(result.battle.state).toMatchObject({ enemyHp: 102, playerHp: 20 });
  });

  it('example 10: pooled attack 2 lines (below the threshold) -> the enemy guard 18 absorbs all 18', () => {
    const start = battleAt(configFor('skeleton'), { enemyHp: 95, enemyGuard: 18, playerHp: 30, enemyActionIndex: 1 });
    const { result } = playSpins(start, [TOP_ATTACK_BOARD, boardFromRows(['G1 S1 G1', 'A1 A1 A1', 'S1 G1 S1']), EMPTY_SPIN_BOARD]);
    expect(result.report).toMatchObject({ focusPct: 0, stopReason: 'max_reached' });
    expect(result.report.outcomes[0]).toMatchObject({ lineCount: 2, gradeSumTotal: 6, multiplierNum: 3, damage: 18, ignoreGuard: false });
    expect(result.report.events[0]).toEqual({
      type: 'enemy_damaged',
      actionId: 'attack',
      damage: 18,
      absorbed: 18,
      hpLoss: 0,
      ignoreGuard: false,
      enemyHp: 95,
      enemyGuard: 0,
    });
    expect(result.battle.state).toMatchObject({ enemyHp: 95, playerHp: 18 });
  });

  // Example 11 (clamp table) lives in turn-stats.test.ts; examples 12 and 13 are in the suites above.
});
