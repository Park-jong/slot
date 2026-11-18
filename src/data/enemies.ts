import type { EnemyDef } from '../core/types';

// M1 spec 1.6 and M2 spec 7. Pattern repeats in order; turn 1 uses pattern[0].
export const ENEMIES = {
  slime: {
    id: 'slime',
    name: '슬라임',
    hp: 24,
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'attack', value: 5 },
      { type: 'guard', value: 5 },
    ],
  },
  goblin_young: {
    id: 'goblin_young',
    name: '어린 고블린',
    hp: 27,
    pattern: [
      { type: 'attack', value: 4 },
      { type: 'attack', value: 8 },
      { type: 'attack', value: 4 },
    ],
  },
  skeleton_recruit: {
    id: 'skeleton_recruit',
    name: '해골 졸병',
    hp: 32,
    pattern: [
      { type: 'guard', value: 5 },
      { type: 'attack', value: 8 },
    ],
  },
  goblin: {
    id: 'goblin',
    name: '고블린',
    hp: 34,
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'attack', value: 9 },
      { type: 'attack', value: 5 },
    ],
  },
  skeleton: {
    id: 'skeleton',
    name: '해골 병사',
    hp: 40,
    pattern: [
      { type: 'guard', value: 6 },
      { type: 'attack', value: 10 },
    ],
  },
  ogre: {
    id: 'ogre',
    name: '오우거',
    hp: 90,
    pattern: [
      { type: 'attack', value: 10 },
      { type: 'charge', value: 2 },
      { type: 'attack', value: 10 },
      { type: 'guard', value: 10 },
    ],
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

/** M2 run order: 5 regular battles, then the boss (M2 spec 7 table). */
export const STAGES: readonly EnemyDef[] = [
  ENEMIES.slime,
  ENEMIES.goblin_young,
  ENEMIES.skeleton_recruit,
  ENEMIES.goblin,
  ENEMIES.skeleton,
  ENEMIES.ogre,
];
