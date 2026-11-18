import type { TierDef } from '../core/types';

// M2.5 spec 3.1 / 6.1: multiplier = multiplierNum / 2 (x1 / x1.5 / x2). Pooled line counts above the last
// tier use the last tier, so 3+ lines stay at x2.
export const STANDARD_TIERS: readonly TierDef[] = [
  { lineCount: 1, multiplierNum: 2 },
  { lineCount: 2, multiplierNum: 3 },
  { lineCount: 3, multiplierNum: 4 },
];

/** M2 four-tier table (x3 at 4+ lines), kept for the M1/M2 regression and balance tests (M2.5 spec 6.2). */
export const M2_TIERS: readonly TierDef[] = [...STANDARD_TIERS, { lineCount: 4, multiplierNum: 6 }];
