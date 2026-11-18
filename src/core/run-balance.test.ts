import { beforeAll, describe, expect, it } from 'vitest';
import { simulateRuns, type RunBalanceResult } from '../test-support/run-balance-sim';

// Quick variant of balance.run.full.test.ts: the sample size and seed of spec section 10 (3000 runs, seed 1).
// Production and design's sim share the rng stream, so at this seed they must reproduce the spec's printed
// numbers; the tolerance is only the rounding of those one-decimal percentages.
const RUNS = 3000;
const SEED = 1;
const ROUNDING_TOLERANCE = 0.001;
const SPEC_GREEDY_WIN_RATE = 0.599;
const SPEC_GREEDY_BOSS_EMPTY = 0.149;
const SPEC_NONE_WIN_RATE = 0.017;
const SPEC_NONE_BOSS_EMPTY = 0.327;
const SIM_TIMEOUT_MS = 60_000;

describe(`M2 run balance, spec sample (${RUNS} runs, seed ${SEED})`, () => {
  let greedy: RunBalanceResult;
  let none: RunBalanceResult;

  beforeAll(() => {
    greedy = simulateRuns('greedy', RUNS, SEED);
    none = simulateRuns('none', RUNS, SEED);
  }, SIM_TIMEOUT_MS);

  it('greedy run win rate reproduces spec section 10', () => {
    expect(Math.abs(greedy.winRate - SPEC_GREEDY_WIN_RATE)).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
  });

  it('greedy boss empty-turn rate reproduces spec section 10', () => {
    expect(Math.abs(greedy.bossEmptyRate - SPEC_GREEDY_BOSS_EMPTY)).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
  });

  it('no-edit baseline win rate reproduces spec section 10', () => {
    expect(Math.abs(none.winRate - SPEC_NONE_WIN_RATE)).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
  });

  it('no-edit baseline boss empty-turn rate reproduces spec section 10', () => {
    expect(Math.abs(none.bossEmptyRate - SPEC_NONE_BOSS_EMPTY)).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
  });
});
