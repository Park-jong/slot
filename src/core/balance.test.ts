import { describe, expect, it } from 'vitest';
import { BALANCE_SEED, simulateWinRate, specWinRateEntries } from '../test-support/balance-sim';

// Quick seeded regression against spec section 4. The full 200k-run check is `npm run test:balance`.
const RUNS = 20_000;
const TOLERANCE = 0.01;

describe('Monte Carlo balance regression', () => {
  for (const [enemyId, expected] of specWinRateEntries()) {
    it(`${enemyId} win rate is within ${TOLERANCE * 100}pp of ${(expected * 100).toFixed(1)}%`, () => {
      const rate = simulateWinRate(enemyId, RUNS, BALANCE_SEED);
      expect(Math.abs(rate - expected)).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
