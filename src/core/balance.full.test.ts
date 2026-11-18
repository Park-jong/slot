import { describe, expect, it } from 'vitest';
import { BALANCE_SEED, simulateWinRate, specWinRateEntries } from '../test-support/balance-sim';

// Opt-in only (`npm run test:balance`): excluded from the default run in vite.config.ts because of its runtime.
const RUNS = 200_000;
const TOLERANCE = 0.01;

describe('Monte Carlo balance, full spec sample size', () => {
  for (const [enemyId, expected] of specWinRateEntries()) {
    it(`${enemyId} win rate over ${RUNS} runs is within ${TOLERANCE * 100}pp of ${(expected * 100).toFixed(1)}%`, () => {
      const rate = simulateWinRate(enemyId, RUNS, BALANCE_SEED);
      console.info(`${enemyId}: ${(rate * 100).toFixed(2)}% (spec ${(expected * 100).toFixed(1)}%)`);
      expect(Math.abs(rate - expected)).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
