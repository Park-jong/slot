import type { EnemyDef } from '../core/types';

// Spec 1.6 (M1 enemies). Pattern repeats in order; turn 1 uses pattern[0].
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
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
