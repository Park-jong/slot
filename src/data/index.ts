import type { BattleConfig } from '../core/types';
import { ACTIONS } from './actions';
import { APPRENTICE_KNIGHT } from './character';
import { ENEMIES, type EnemyId } from './enemies';
import { GRADES } from './grades';

export { ACTIONS, ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from './actions';
export { APPRENTICE_KNIGHT } from './character';
export { ENEMIES, type EnemyId } from './enemies';
export { GRADES } from './grades';
export { STANDARD_TIERS } from './tiers';

/** M1 battle: apprentice knight with starting reels against one enemy. */
export function createM1BattleConfig(enemyId: EnemyId): BattleConfig {
  return {
    character: APPRENTICE_KNIGHT,
    enemy: ENEMIES[enemyId],
    reels: APPRENTICE_KNIGHT.startingReels,
    actions: ACTIONS,
    grades: GRADES,
  };
}
