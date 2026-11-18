import { beforeAll, describe, expect, it } from 'vitest';
import { binomialStdErr, simulateRuns, type RunBalanceResult } from '../test-support/run-balance-sim';

// Opt-in only (`npm run test:balance`, see vite.config.ts): whole-run Monte Carlo on the production engine
// against design's reference simulator (tools/sim/run-sim.mjs, spec m2-run-spec.md section 10).
const RUNS = 200_000;
const SEED = 20261117;
const PERCENT = 100;
const HOOK_TIMEOUT_MS = 300_000;

// Design's run-sim.mjs at the same N and seed (greedy: 118077 wins, boss 91043 empty of 620624 turns;
// none: 1.6%, boss empty 32.8%). The two simulators draw the same rng stream, so they agree exactly;
// the tolerances below only absorb the 1-decimal rounding of design's printout.
const DESIGN_GREEDY_WIN_RATE = 118_077 / RUNS;
const DESIGN_GREEDY_BOSS_EMPTY = 91_043 / 620_624;
const DESIGN_NONE_WIN_RATE = 0.016;

// Spec section 10 numbers come from 3000 runs with seed 1.
const SPEC_GREEDY_WIN_RATE = 0.599;
const SPEC_GREEDY_BOSS_EMPTY = 0.149;
const SPEC_NONE_WIN_RATE = 0.017;
/**
 * The greedy policy scores edits on one fixed 700-spin sample, so its quality varies with the seed far more
 * than binomial noise does: design's sim over seeds 1..10 at 200k gives 56.7%..59.4% (sd about 0.9pp).
 * 3pp is about 2.3 sd of (spec's 3000-run error 0.9pp, policy-sample spread 0.9pp) combined.
 */
const SPEC_WIN_RATE_TOLERANCE = 0.03;
const SPEC_BOSS_EMPTY_TOLERANCE = 0.005;
const SPEC_NONE_TOLERANCE = 0.01;

/** Production vs design at the same seed: ~4.5 binomial standard errors at 200k runs (SE 0.11pp at p=0.59). */
const SE_MULTIPLE = 4.5;
const DESIGN_WIN_RATE_TOLERANCE = SE_MULTIPLE * binomialStdErr(DESIGN_GREEDY_WIN_RATE, RUNS);
const DESIGN_BOSS_EMPTY_TOLERANCE = 0.003;
const DESIGN_NONE_TOLERANCE = 0.003;

describe(`M2 run balance on the production engine, ${RUNS} runs`, () => {
  let greedy: RunBalanceResult;
  let none: RunBalanceResult;

  beforeAll(() => {
    greedy = simulateRuns('greedy', RUNS, SEED);
    none = simulateRuns('none', RUNS, SEED);
    const pct = (x: number) => (x * PERCENT).toFixed(2);
    console.info(`greedy: win ${pct(greedy.winRate)}%, boss empty ${pct(greedy.bossEmptyRate)}%, deaths ${greedy.deaths.join(',')}`);
    console.info(`none:   win ${pct(none.winRate)}%, boss empty ${pct(none.bossEmptyRate)}%`);
  }, HOOK_TIMEOUT_MS);

  it('greedy run win rate matches design sim at the same seed', () => {
    expect(Math.abs(greedy.winRate - DESIGN_GREEDY_WIN_RATE)).toBeLessThanOrEqual(DESIGN_WIN_RATE_TOLERANCE);
  });

  it('greedy boss empty-turn rate matches design sim at the same seed', () => {
    expect(Math.abs(greedy.bossEmptyRate - DESIGN_GREEDY_BOSS_EMPTY)).toBeLessThanOrEqual(DESIGN_BOSS_EMPTY_TOLERANCE);
  });

  it('no-edit baseline win rate matches design sim at the same seed', () => {
    expect(Math.abs(none.winRate - DESIGN_NONE_WIN_RATE)).toBeLessThanOrEqual(DESIGN_NONE_TOLERANCE);
  });

  it('greedy run win rate is within the policy-spread tolerance of the spec 59.9%', () => {
    expect(Math.abs(greedy.winRate - SPEC_GREEDY_WIN_RATE)).toBeLessThanOrEqual(SPEC_WIN_RATE_TOLERANCE);
  });

  it('greedy boss empty-turn rate is within tolerance of the spec 14.9%', () => {
    expect(Math.abs(greedy.bossEmptyRate - SPEC_GREEDY_BOSS_EMPTY)).toBeLessThanOrEqual(SPEC_BOSS_EMPTY_TOLERANCE);
  });

  it('no-edit baseline win rate is within tolerance of the spec 1.7%', () => {
    expect(Math.abs(none.winRate - SPEC_NONE_WIN_RATE)).toBeLessThanOrEqual(SPEC_NONE_TOLERANCE);
  });

  it('greedy editing beats the no-edit baseline by a wide margin', () => {
    expect(greedy.winRate - none.winRate).toBeGreaterThan(SPEC_GREEDY_WIN_RATE / 2);
  });

});
