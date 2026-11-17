import type { TierDef } from '../core/types';

// Spec 1.3: multiplier = multiplierNum / 2. Line counts above the last tier use the last tier.
export const STANDARD_TIERS: readonly TierDef[] = [
  { lineCount: 1, multiplierNum: 2 },
  { lineCount: 2, multiplierNum: 3 },
  { lineCount: 3, multiplierNum: 4 },
  { lineCount: 4, multiplierNum: 6 },
];
