// M2.5 multi-spin numbers: SINGLE SOURCE for ms-sim.mjs, ms-turn-stats.mjs, ms-reel-stats.mjs, ms-examples.mjs.
// Mirrors docs/specs/m25-multispin-spec.md. run-config.mjs (M2, one spin per turn) is left untouched.
//
// Field guide (product file in brackets):
//   maxHp                 player max HP                                   [character.ts maxHp]
//   spins.base/add/mulPct effective maxSpins = clamp(floor((base + add) * mulPct / 100), min, hardCap)
//                         base 3 is the character stat; add / mulPct are the sums/products of M4 modifiers
//                                                                         [character.ts spinsPerTurn + run rules]
//   spins.min/hardCap     clamp bounds (1 / 5)                            [run.ts]
//   pool                  true = B1: lines of all spins pooled per action, tier from the TOTAL line count
//                         false = B2: every spin evaluated alone, final numbers summed (comparison only)
//   tiers                 [{n, num}] multiplier = num / 2 for line count >= n (largest n wins) [tiers.ts]
//   ignoreGuardAt         attack lines (pooled, per turn) needed for ignore_guard [actions.ts attack effect minLines]
//   actions               basePower per grade-sum unit: dmg / guard       [actions.ts basePower]
//   dmgPct                extra damage percent (M4 modifier hook, e.g. "-1 spin, +X% damage"); 0 in the base game
//   unused.mode           benefit of unused spins: 'focus' (chosen), 'guard', 'bank', 'token', 'none'
//   unused.focusPct       focus: +% to damage AND guard per unused spin, added inside the single floor  [run.ts / character]
//   unused.guardPer       'guard' alternative: flat guard per unused spin
//   unused.bankCap        'bank' alternative: max carried spins (turn max = maxSpins + banked)
//   unused.tokenValue     'token' alternative (M3 resource proxy): utility per unused spin, no combat effect
//   startReel             identical starting reel used for all 3 reels    [character.ts startingReels]
//   stages                5 battles + boss: hp and repeating intent pattern [enemies.ts]
//   heal.afterBattle      HP after battles 1..4; heal.beforeBoss 50 = full heal after battle 5 [run.ts]
//   N                     delete/enhance opportunity after battle k when k % N == 0 [run.ts editEveryNBattles]
//   poolActionW/GradeW    reward pool weights (unchanged from M2)         [run.ts]
//   reelMax/reelMin       reel size bounds (unchanged)                    [run.ts]
//   policy.*              simulator-only: smart-stop policy utility weights and lookahead sample sizes
//   editor.*              simulator-only: greedy reel editor samples (full turns) and guard weight
const S = (a, g = 1, n = 1) => Array.from({ length: n }, () => ({ a, g }));
const attack = (value) => ({ type: 'attack', value });
const guard = (value) => ({ type: 'guard', value });
const charge = (value) => ({ type: 'charge', value });

export const MS = {
  maxHp: 50,
  spins: { base: 3, add: 0, mulPct: 100, min: 1, hardCap: 5 },
  pool: true,
  tiers: [{ n: 1, num: 2 }, { n: 2, num: 3 }, { n: 3, num: 4 }],
  ignoreGuardAt: 3,
  actions: { attack: { dmg: 2, guard: 0 }, guard: { dmg: 0, guard: 2 }, shield_bash: { dmg: 1, guard: 1 } },
  dmgPct: 0,
  unused: { mode: 'focus', focusPct: 50, guardPer: 4, bankCap: 2, tokenValue: 0 },
  startReel: [...S('attack', 1, 3), ...S('guard', 1, 2), ...S('shield_bash', 1, 2)],
  stages: [
    { id: 'slime', name: 'Slime', hp: 72, pattern: [attack(6), attack(6), guard(15)] },
    { id: 'goblin_young', name: 'Young Goblin', hp: 81, pattern: [attack(5), attack(10), attack(5)] },
    { id: 'skeleton_recruit', name: 'Skeleton Recruit', hp: 96, pattern: [guard(15), attack(10)] },
    { id: 'goblin', name: 'Goblin', hp: 102, pattern: [attack(6), attack(10), attack(6)] },
    { id: 'skeleton', name: 'Skeleton', hp: 120, pattern: [guard(18), attack(12)] },
    { id: 'ogre', name: 'Ogre', hp: 310, pattern: [attack(9), charge(2), attack(9), guard(30)] },
  ],
  heal: { afterBattle: 8, beforeBoss: 50 },
  N: 3,
  poolActionW: { attack: 40, guard: 30, shield_bash: 30 },
  poolGradeW: [[80, 20, 0, 0], [70, 28, 2, 0], [55, 35, 10, 0], [45, 38, 15, 2], [35, 40, 20, 5]],
  reelMax: 12, reelMin: 3,
  policy: { guardW: 0.8, lethalBonus: 10, deathPenalty: 60, bankSize: 384, s1: 40, s2: 40, bankSpinValue: 0.8 },
  editor: { samples: 400, guardW: 0.7 },
};
