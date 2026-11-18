import type { CharacterDef, Reel, ReelSymbol } from '../core/types';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from './actions';

interface ReelEntry {
  readonly symbol: ReelSymbol;
  readonly count: number;
}

function buildReel(entries: readonly ReelEntry[]): Reel {
  return entries.flatMap(({ symbol, count }) => Array.from({ length: count }, () => symbol));
}

// M2 spec 5: attack(1) x3, guard(1) x1, shield_bash(1) x2 on each of the 3 reels.
const STARTING_REEL = buildReel([
  { symbol: { actionId: ACTION_ATTACK, grade: 1 }, count: 3 },
  { symbol: { actionId: ACTION_GUARD, grade: 1 }, count: 1 },
  { symbol: { actionId: ACTION_SHIELD_BASH, grade: 1 }, count: 2 },
]);

/** M1 spec 1.5 reel (attack x3, guard x2, shield_bash x1), kept for the M1 regression and balance tests. */
export const M1_STARTING_REEL = buildReel([
  { symbol: { actionId: ACTION_ATTACK, grade: 1 }, count: 3 },
  { symbol: { actionId: ACTION_GUARD, grade: 1 }, count: 2 },
  { symbol: { actionId: ACTION_SHIELD_BASH, grade: 1 }, count: 1 },
]);

export const APPRENTICE_KNIGHT: CharacterDef = {
  id: 'apprentice_knight',
  name: '견습 기사',
  maxHp: 50,
  skillActionId: ACTION_SHIELD_BASH,
  startingReels: [STARTING_REEL, STARTING_REEL, STARTING_REEL],
};
