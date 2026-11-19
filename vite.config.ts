import { configDefaults, defineConfig } from 'vitest/config';

// `vitest run --mode balance` runs only the slow full-size balance simulation; the default run skips it.
const FULL_BALANCE_TESTS = 'src/**/*.full.test.ts';
const FULL_BALANCE_TIMEOUT_MS = 300_000;

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the build works under the GitHub Pages sub-path (/slot/).
  base: './',
  test:
    mode === 'balance'
      ? { include: [FULL_BALANCE_TESTS], environment: 'node', testTimeout: FULL_BALANCE_TIMEOUT_MS }
      : { include: ['src/**/*.test.ts'], exclude: [...configDefaults.exclude, FULL_BALANCE_TESTS], environment: 'node' },
}));
