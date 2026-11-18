// Tunable M2 numbers (single source for run-sim.mjs). Mirrors docs/specs/m2-run-spec.md.
const S = (a, g = 1, n = 1) => Array.from({ length: n }, () => ({ a, g }));
export const CFG = {
  maxHp: 50,
  tiers: [{ n: 1, num: 2 }, { n: 2, num: 3 }, { n: 3, num: 4 }, { n: 4, num: 6 }],
  ignoreGuardAt: 2,
  actions: { attack: { dmg: 2, guard: 0 }, guard: { dmg: 0, guard: 2 }, shield_bash: { dmg: 1, guard: 1 } },
  startReel: [...S('attack', 1, 3), ...S('guard', 1, 1), ...S('shield_bash', 1, 2)],
  // One entry per battle (stage 1..5, then boss). Explicit per-stage stats (spec section 4).
  stages: [
    { id: 'slime', name: 'Slime', hp: 24, pattern: [{ type: 'attack', value: 5 }, { type: 'attack', value: 5 }, { type: 'guard', value: 5 }] },
    { id: 'goblin_a', name: 'Goblin', hp: 27, pattern: [{ type: 'attack', value: 4 }, { type: 'attack', value: 8 }, { type: 'attack', value: 4 }] },
    { id: 'skeleton_a', name: 'Skeleton', hp: 32, pattern: [{ type: 'guard', value: 5 }, { type: 'attack', value: 8 }] },
    { id: 'goblin_b', name: 'Goblin', hp: 34, pattern: [{ type: 'attack', value: 5 }, { type: 'attack', value: 9 }, { type: 'attack', value: 5 }] },
    { id: 'skeleton_b', name: 'Skeleton', hp: 40, pattern: [{ type: 'guard', value: 6 }, { type: 'attack', value: 10 }] },
    { id: 'ogre', name: 'Ogre', hp: 90, pattern: [{ type: 'attack', value: 10 }, { type: 'charge', value: 2 }, { type: 'attack', value: 10 }, { type: 'guard', value: 10 }] },
  ],
  heal: { afterBattle: 8, beforeBoss: 50 }, // HP restored after battles 1..4 / extra after battle 5 (50 = full heal)
  N: 3,                                  // delete/enhance opportunity after battle k when k % N == 0
  poolActionW: { attack: 40, guard: 30, shield_bash: 30 },
  poolGradeW: [ // by battle just cleared (1..5): weights for grade 1..4
    [80, 20, 0, 0], [70, 28, 2, 0], [55, 35, 10, 0], [45, 38, 15, 2], [35, 40, 20, 5],
  ],
  reelMax: 12, reelMin: 3,
};
