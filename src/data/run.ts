import type { GradeId, GradeWeight, RunRules, TurnRules } from '../core/types';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from './actions';

/** Grades a reward can have, in candidate order (inner loop of M2 spec 2.1). */
const REWARD_GRADES: readonly GradeId[] = [1, 2, 3, 4];

function gradeWeights(weights: readonly number[]): GradeWeight[] {
  return REWARD_GRADES.map((grade, index) => ({ grade, weight: weights[index] ?? 0 }));
}

// M2.5 spec 5.1 / 6.1: Focus per unused spin and the clamp bounds of the effective max spins.
export const TURN_RULES: TurnRules = {
  focusPercentPerUnusedSpin: 50,
  spinsPerTurnMin: 1,
  spinsPerTurnHardCap: 5,
};

// M2 spec 1-4 (unchanged in M2.5) plus the turn rules. Max HP comes from the character
// (APPRENTICE_KNIGHT.maxHp = 50) so it has a single source.
export const RUN_RULES: RunRules = {
  ...TURN_RULES,
  healAfterBattle: 8,
  healBeforeBoss: 'full',
  editEveryNBattles: 3,
  reelMin: 3,
  reelMax: 12,
  offerCount: 3,
  actionWeights: [
    { actionId: ACTION_ATTACK, weight: 40 },
    { actionId: ACTION_GUARD, weight: 30 },
    { actionId: ACTION_SHIELD_BASH, weight: 30 },
  ],
  // Columns: grade 1, 2, 3, 4. Keyed by battles cleared.
  gradeWeightsByCleared: {
    1: gradeWeights([80, 20, 0, 0]),
    2: gradeWeights([70, 28, 2, 0]),
    3: gradeWeights([55, 35, 10, 0]),
    4: gradeWeights([45, 38, 15, 2]),
    5: gradeWeights([35, 40, 20, 5]),
  },
};
