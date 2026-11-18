import type { BattleConfig, RunDefinition } from '../core/types';
import { ACTIONS } from './actions';
import { APPRENTICE_KNIGHT } from './character';
import { ENEMIES, STAGES, type EnemyId } from './enemies';
import { GRADES } from './grades';
import { RUN_RULES } from './run';

export { ACTIONS, ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from './actions';
export { APPRENTICE_KNIGHT, M1_STARTING_REEL } from './character';
export { ENEMIES, STAGES, type EnemyId } from './enemies';
export { GRADES } from './grades';
export { RUN_RULES } from './run';
export { STANDARD_TIERS } from './tiers';

/** Single battle: apprentice knight with the M2 starting reels against one enemy. */
export function createStartingBattleConfig(enemyId: EnemyId): BattleConfig {
  return {
    character: APPRENTICE_KNIGHT,
    enemy: ENEMIES[enemyId],
    reels: APPRENTICE_KNIGHT.startingReels,
    actions: ACTIONS,
    grades: GRADES,
  };
}

/** M2 run: 5 battles and the boss with the apprentice knight. Pass to core `startRun`. */
export const M2_RUN: RunDefinition = {
  character: APPRENTICE_KNIGHT,
  stages: STAGES,
  actions: ACTIONS,
  grades: GRADES,
  rules: RUN_RULES,
};
