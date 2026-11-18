import { beforeAll, describe, expect, it } from 'vitest';
import { binomialStdErr, simulateMultispinRuns, type MultispinBalanceResult } from '../test-support/multispin-balance-sim';

// Opt-in only (`npm run test:balance`, see vite.config.ts): full-size M2.5 whole-run Monte Carlo on the production
// engine (spinRun/stopRun + M25_RUN) against design's reference simulator tools/sim/ms-sim.mjs and spec
// m25-multispin 11.1. Same seed and chunking => both simulators draw identical random numbers, so the win counts
// below are design's integer wins (`simulate()` of ms-sim.mjs) and must match exactly. Each policy has its own
// beforeAll so every hook stays far below the 300 s balance-mode timeout.
const SEED = 1;
const PERCENT = 100;
const HOOK_TIMEOUT_MS = 290_000;

// ---- sizes and design wins at seed 1 ----
const MAX_GREEDY = { runs: 200_000, designWins: 92_275 };
const ONCE_GREEDY = { runs: 20_000, designWins: 13 };
const SMART_GREEDY = { runs: 12_000, designWins: 7_452 };
const SMART_TAKEALL = { runs: 6_000, designWins: 342 };
const SMART_NONE = { runs: 4_000, designWins: 2 };

// ---- spec 11.1 reference (20000 runs, seed 1) ----
const SPEC_MAX_GREEDY = 0.458;
const SPEC_SMART_GREEDY = 0.618;
const SPEC_SMART_TAKEALL = 0.056;
const SPEC_EARLY_STOP = 0.281;
const SPEC_NON_LETHAL_STOP = 0.124;
const MAX_GREEDY_TOLERANCE = 0.01;
const SMART_GREEDY_TOLERANCE = 0.03;
const SMART_TAKEALL_TOLERANCE = 0.02;
const EARLY_STOP_TOLERANCE = 0.03;
const WEAK_POLICY_MAX_WIN_RATE = 0.01;
const MIN_SMART_OVER_MAX_GAP = 0.08;
const BOSS_EMPTY_TURN_MIN = 0.01;
const BOSS_EMPTY_TURN_MAX = 0.04;
const FIRST_STAGE_EMPTY_TURN_MIN = 0.07;
const FIRST_STAGE_EMPTY_TURN_MAX = 0.11;
const BOSS_EMPTY_SPIN_MIN = 0.25;
const BOSS_EMPTY_SPIN_MAX = 0.35;
/** Spec 11.1 spins per turn: 3.00 (max), 2.62 (smart). */
const SPEC_SMART_SPINS_PER_TURN = 2.62;
const SPINS_PER_TURN_TOLERANCE = 0.1;
const MAX_SPINS_PER_TURN = 3;

const pct = (x: number): string => (x * PERCENT).toFixed(2);
const describeRun = (name: string, r: MultispinBalanceResult): string => {
  const first = r.stages[0];
  const boss = r.stages[r.stages.length - 1];
  return (
    `${name}: win ${pct(r.winRate)}% (${r.wins}/${r.runs}, SE ${pct(binomialStdErr(r.winRate, r.runs))}pp) ` +
    `early ${pct(r.earlyStopRate)}% non-lethal ${pct(r.nonLethalStopRate)}% spins/turn ${r.spinsPerTurn.toFixed(2)} ` +
    `stage1 empty turn ${pct((first?.emptyTurns ?? 0) / (first?.turns || 1))}% empty spin ${pct((first?.emptySpins ?? 0) / (first?.spins || 1))}% ` +
    `boss empty turn ${pct((boss?.emptyTurns ?? 0) / (boss?.turns || 1))}% empty spin ${pct(r.bossEmptySpinRate)}% ` +
    `deaths ${r.deaths.join(',')}`
  );
};

let maxGreedy: MultispinBalanceResult;
let onceGreedy: MultispinBalanceResult;
let smartGreedy: MultispinBalanceResult;
let smartTakeall: MultispinBalanceResult;
let smartNone: MultispinBalanceResult;

describe(`M2.5 max stop + greedy editor, ${MAX_GREEDY.runs} runs`, () => {
  beforeAll(() => {
    maxGreedy = simulateMultispinRuns({ stop: 'max', edit: 'greedy', runs: MAX_GREEDY.runs, seed: SEED });
    console.info(describeRun('max+greedy', maxGreedy));
  }, HOOK_TIMEOUT_MS);

  it('win count equals design at the same seed', () => {
    expect(maxGreedy.wins).toBe(MAX_GREEDY.designWins);
  });

  it('win rate is within 1pp of the spec 45.8%', () => {
    expect(Math.abs(maxGreedy.winRate - SPEC_MAX_GREEDY)).toBeLessThanOrEqual(MAX_GREEDY_TOLERANCE);
  });

  it('uses every spin of every turn', () => {
    expect(maxGreedy.earlyStopRate).toBe(0);
    expect(maxGreedy.spinsPerTurn).toBe(MAX_SPINS_PER_TURN);
  });

  it('boss empty-turn rate is 1-4% (AC-9.2)', () => {
    const boss = maxGreedy.stages[maxGreedy.stages.length - 1]!;
    expect(boss.emptyTurns / boss.turns).toBeGreaterThanOrEqual(BOSS_EMPTY_TURN_MIN);
    expect(boss.emptyTurns / boss.turns).toBeLessThanOrEqual(BOSS_EMPTY_TURN_MAX);
  });

  it('stage-1 empty-turn rate is 7-11% (AC-9.2)', () => {
    const first = maxGreedy.stages[0]!;
    expect(first.emptyTurns / first.turns).toBeGreaterThanOrEqual(FIRST_STAGE_EMPTY_TURN_MIN);
    expect(first.emptyTurns / first.turns).toBeLessThanOrEqual(FIRST_STAGE_EMPTY_TURN_MAX);
  });

  it('boss empty-spin rate is 25-35% (AC-9.2)', () => {
    expect(maxGreedy.bossEmptySpinRate).toBeGreaterThanOrEqual(BOSS_EMPTY_SPIN_MIN);
    expect(maxGreedy.bossEmptySpinRate).toBeLessThanOrEqual(BOSS_EMPTY_SPIN_MAX);
  });
});

describe(`M2.5 once stop + greedy editor, ${ONCE_GREEDY.runs} runs`, () => {
  beforeAll(() => {
    onceGreedy = simulateMultispinRuns({ stop: 'once', edit: 'greedy', runs: ONCE_GREEDY.runs, seed: SEED });
    console.info(describeRun('once+greedy', onceGreedy));
  }, HOOK_TIMEOUT_MS);

  it('win count equals design at the same seed', () => {
    expect(onceGreedy.wins).toBe(ONCE_GREEDY.designWins);
  });

  it('almost never clears the run (<= 1%)', () => {
    expect(onceGreedy.winRate).toBeLessThanOrEqual(WEAK_POLICY_MAX_WIN_RATE);
  });
});

describe(`M2.5 smart stop + greedy editor, ${SMART_GREEDY.runs} runs`, () => {
  beforeAll(() => {
    smartGreedy = simulateMultispinRuns({ stop: 'smart', edit: 'greedy', runs: SMART_GREEDY.runs, seed: SEED });
    console.info(describeRun('smart+greedy', smartGreedy));
    console.info(`design reference: early ${pct(SPEC_EARLY_STOP)}% non-lethal ${pct(SPEC_NON_LETHAL_STOP)}% spins/turn ${SPEC_SMART_SPINS_PER_TURN}`);
  }, HOOK_TIMEOUT_MS);

  it('win count equals design at the same seed', () => {
    expect(smartGreedy.wins).toBe(SMART_GREEDY.designWins);
  });

  it('win rate is within 3pp of the spec 61.8%', () => {
    expect(Math.abs(smartGreedy.winRate - SPEC_SMART_GREEDY)).toBeLessThanOrEqual(SMART_GREEDY_TOLERANCE);
  });

  it('choosing when to stop is worth at least 8pp over always spinning to the max', () => {
    expect(smartGreedy.winRate - maxGreedy.winRate).toBeGreaterThanOrEqual(MIN_SMART_OVER_MAX_GAP);
  });

  it('early-stop rate is near the design 28.1%', () => {
    expect(Math.abs(smartGreedy.earlyStopRate - SPEC_EARLY_STOP)).toBeLessThanOrEqual(EARLY_STOP_TOLERANCE);
  });

  it('non-lethal stop rate is near the design 12.4%', () => {
    expect(Math.abs(smartGreedy.nonLethalStopRate - SPEC_NON_LETHAL_STOP)).toBeLessThanOrEqual(EARLY_STOP_TOLERANCE);
  });

  it('spins per turn is near the design 2.62', () => {
    expect(Math.abs(smartGreedy.spinsPerTurn - SPEC_SMART_SPINS_PER_TURN)).toBeLessThanOrEqual(SPINS_PER_TURN_TOLERANCE);
  });
});

describe(`M2.5 smart stop + take-everything editor, ${SMART_TAKEALL.runs} runs`, () => {
  beforeAll(() => {
    smartTakeall = simulateMultispinRuns({ stop: 'smart', edit: 'takeall', runs: SMART_TAKEALL.runs, seed: SEED });
    console.info(describeRun('smart+takeall', smartTakeall));
  }, HOOK_TIMEOUT_MS);

  it('win count equals design at the same seed', () => {
    expect(smartTakeall.wins).toBe(SMART_TAKEALL.designWins);
  });

  it('win rate is within 2pp of the spec 5.6%', () => {
    expect(Math.abs(smartTakeall.winRate - SPEC_SMART_TAKEALL)).toBeLessThanOrEqual(SMART_TAKEALL_TOLERANCE);
  });
});

describe(`M2.5 smart stop + no editing, ${SMART_NONE.runs} runs`, () => {
  beforeAll(() => {
    smartNone = simulateMultispinRuns({ stop: 'smart', edit: 'none', runs: SMART_NONE.runs, seed: SEED });
    console.info(describeRun('smart+none', smartNone));
  }, HOOK_TIMEOUT_MS);

  it('win count equals design at the same seed', () => {
    expect(smartNone.wins).toBe(SMART_NONE.designWins);
  });

  it('almost never clears the run (<= 1%)', () => {
    expect(smartNone.winRate).toBeLessThanOrEqual(WEAK_POLICY_MAX_WIN_RATE);
  });
});
