import type { CharacterDef, Reel, ReelSymbol } from '../core/types';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from './actions';

interface ReelEntry {
  readonly symbol: ReelSymbol;
  readonly count: number;
}

function buildReel(entries: readonly ReelEntry[]): Reel {
  return entries.flatMap(({ symbol, count }) => Array.from({ length: count }, () => symbol));
}

/** Grade-1 reel with the given number of attack, guard and shield_bash symbols, in that order. */
function gradeOneReel(attacks: number, guards: number, shieldBashes: number): Reel {
  return buildReel([
    { symbol: { actionId: ACTION_ATTACK, grade: 1 }, count: attacks },
    { symbol: { actionId: ACTION_GUARD, grade: 1 }, count: guards },
    { symbol: { actionId: ACTION_SHIELD_BASH, grade: 1 }, count: shieldBashes },
  ]);
}

// M2.5 spec 6.1: attack(1) x3, guard(1) x2, shield_bash(1) x2 on each of the 3 reels.
const STARTING_REEL = gradeOneReel(3, 2, 2);

/** M2 spec 5 reel (attack x3, guard x1, shield_bash x2), kept for the M2 regression and balance tests. */
export const M2_STARTING_REEL = gradeOneReel(3, 1, 2);

/** M1 spec 1.5 reel (attack x3, guard x2, shield_bash x1), kept for the M1 regression and balance tests. */
export const M1_STARTING_REEL = gradeOneReel(3, 2, 1);

export const APPRENTICE_KNIGHT: CharacterDef = {
  id: 'apprentice_knight',
  name: '견습 기사',
  maxHp: 50,
  skillActionId: ACTION_SHIELD_BASH,
  startingReels: [STARTING_REEL, STARTING_REEL, STARTING_REEL],
  spinsPerTurn: 3,
};

/** M2 apprentice knight: M2 reels and one spin per turn, so turns resolve exactly as in M2 (M2.5 spec 6.2). */
export const M2_CHARACTER: CharacterDef = {
  ...APPRENTICE_KNIGHT,
  startingReels: [M2_STARTING_REEL, M2_STARTING_REEL, M2_STARTING_REEL],
  spinsPerTurn: 1,
};
