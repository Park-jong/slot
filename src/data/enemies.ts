import type { EnemyDef } from '../core/types';

// M2.5 spec 6.1. Pattern repeats in order; turn 1 uses pattern[0].
export const ENEMIES = {
  slime: {
    id: 'slime',
    name: '슬라임',
    hp: 72,
    pattern: [
      { type: 'attack', value: 6 },
      { type: 'attack', value: 6 },
      { type: 'guard', value: 15 },
    ],
  },
  goblin_young: {
    id: 'goblin_young',
    name: '어린 고블린',
    hp: 81,
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'attack', value: 10 },
      { type: 'attack', value: 5 },
    ],
  },
  skeleton_recruit: {
    id: 'skeleton_recruit',
    name: '해골 졸병',
    hp: 96,
    pattern: [
      { type: 'guard', value: 15 },
      { type: 'attack', value: 10 },
    ],
  },
  goblin: {
    id: 'goblin',
    name: '고블린',
    hp: 102,
    pattern: [
      { type: 'attack', value: 6 },
      { type: 'attack', value: 10 },
      { type: 'attack', value: 6 },
    ],
  },
  skeleton: {
    id: 'skeleton',
    name: '해골 병사',
    hp: 120,
    pattern: [
      { type: 'guard', value: 18 },
      { type: 'attack', value: 12 },
    ],
  },
  ogre: {
    id: 'ogre',
    name: '오우거',
    hp: 310,
    pattern: [
      { type: 'attack', value: 9 },
      { type: 'charge', value: 2 },
      { type: 'attack', value: 9 },
      { type: 'guard', value: 30 },
    ],
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

/**
 * M1 spec 1.6 / M2 spec 7 HP and patterns, kept for the M1/M2 regression and balance tests
 * (M2.5 spec 6.2). Ids and names are shared with ENEMIES.
 */
export const M2_ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = {
  slime: {
    ...ENEMIES.slime,
    hp: 24,
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'attack', value: 5 },
      { type: 'guard', value: 5 },
    ],
  },
  goblin_young: {
    ...ENEMIES.goblin_young,
    hp: 27,
    pattern: [
      { type: 'attack', value: 4 },
      { type: 'attack', value: 8 },
      { type: 'attack', value: 4 },
    ],
  },
  skeleton_recruit: {
    ...ENEMIES.skeleton_recruit,
    hp: 32,
    pattern: [
      { type: 'guard', value: 5 },
      { type: 'attack', value: 8 },
    ],
  },
  goblin: {
    ...ENEMIES.goblin,
    hp: 34,
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'attack', value: 9 },
      { type: 'attack', value: 5 },
    ],
  },
  skeleton: {
    ...ENEMIES.skeleton,
    hp: 40,
    pattern: [
      { type: 'guard', value: 6 },
      { type: 'attack', value: 10 },
    ],
  },
  ogre: {
    ...ENEMIES.ogre,
    hp: 90,
    pattern: [
      { type: 'attack', value: 10 },
      { type: 'charge', value: 2 },
      { type: 'attack', value: 10 },
      { type: 'guard', value: 10 },
    ],
  },
};

/** Run order: 5 regular battles, then the boss (M2 spec 7, unchanged in M2.5). */
const STAGE_ORDER: readonly EnemyId[] = ['slime', 'goblin_young', 'skeleton_recruit', 'goblin', 'skeleton', 'ogre'];

export const STAGES: readonly EnemyDef[] = STAGE_ORDER.map((id) => ENEMIES[id]);

/** M2 stages (M2_ENEMIES in run order) for the M2 regression run. */
export const M2_STAGES: readonly EnemyDef[] = STAGE_ORDER.map((id) => M2_ENEMIES[id]);
