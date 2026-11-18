import type { BattleConfig, RunDefinition } from '../core/types';
import { ACTIONS, M2_ACTIONS } from './actions';
import { APPRENTICE_KNIGHT, M2_CHARACTER } from './character';
import { ENEMIES, M2_ENEMIES, M2_STAGES, STAGES, type EnemyId } from './enemies';
import { GRADES } from './grades';
import { RUN_RULES, TURN_RULES } from './run';

export { ACTIONS, ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, M2_ACTIONS } from './actions';
export { APPRENTICE_KNIGHT, M1_STARTING_REEL, M2_CHARACTER, M2_STARTING_REEL } from './character';
export { ENEMIES, M2_ENEMIES, M2_STAGES, STAGES, type EnemyId } from './enemies';
export { GRADES } from './grades';
export { RUN_RULES, TURN_RULES } from './run';
export { M2_TIERS, STANDARD_TIERS } from './tiers';

/** Single M2.5 battle: apprentice knight (3 spins per turn) with the M2.5 starting reels against one enemy. */
export function createStartingBattleConfig(enemyId: EnemyId): BattleConfig {
  return {
    character: APPRENTICE_KNIGHT,
    enemy: ENEMIES[enemyId],
    reels: APPRENTICE_KNIGHT.startingReels,
    actions: ACTIONS,
    grades: GRADES,
    turnRules: TURN_RULES,
  };
}

/**
 * Single M2 battle for the M1/M2 regression tests: M2 reels, actions and enemy numbers with one spin per
 * turn, so resolveTurn / playTurn give exactly the M2 results (M2.5 spec 6.2).
 */
export function createM2BattleConfig(enemyId: EnemyId): BattleConfig {
  return {
    character: M2_CHARACTER,
    enemy: M2_ENEMIES[enemyId],
    reels: M2_CHARACTER.startingReels,
    actions: M2_ACTIONS,
    grades: GRADES,
    turnRules: TURN_RULES,
  };
}

/** M2.5 product run: 5 battles and the boss, up to 3 spins per turn. Pass to core `startRun`. */
export const M25_RUN: RunDefinition = {
  character: APPRENTICE_KNIGHT,
  stages: STAGES,
  actions: ACTIONS,
  grades: GRADES,
  rules: RUN_RULES,
};

/** M2 regression run (M2 numbers, one spin per turn) for the M2 run and balance tests. */
export const M2_RUN: RunDefinition = {
  character: M2_CHARACTER,
  stages: M2_STAGES,
  actions: M2_ACTIONS,
  grades: GRADES,
  rules: RUN_RULES,
};
