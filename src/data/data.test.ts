import { describe, expect, it } from 'vitest';
import { reelFromNotation } from '../test-support/test-helpers';
import type { ActionDef, EnemyDef } from '../core/types';
import {
  ACTION_ATTACK,
  ACTIONS,
  APPRENTICE_KNIGHT,
  createM2BattleConfig,
  createStartingBattleConfig,
  ENEMIES,
  GRADES,
  M1_STARTING_REEL,
  M25_RUN,
  M2_ACTIONS,
  M2_CHARACTER,
  M2_ENEMIES,
  M2_RUN,
  M2_STAGES,
  M2_STARTING_REEL,
  M2_TIERS,
  RUN_RULES,
  STAGES,
  STANDARD_TIERS,
  TURN_RULES,
} from '.';

const intents = (pattern: readonly { type: string; value: number }[]) => pattern.map((i) => `${i.type} ${i.value}`).join(' -> ');
const stageRows = (stages: readonly EnemyDef[]) => stages.map((enemy) => [enemy.id, enemy.name, enemy.hp, intents(enemy.pattern)]);
const tierRows = (actions: readonly ActionDef[]) =>
  actions.map((action) => [action.id, action.tiers.map((tier) => `${tier.lineCount}:${tier.multiplierNum}`).join(' ')]);
const effectRows = (actions: readonly ActionDef[]) =>
  actions.map((action) => [action.id, action.effects.map((e) => `${e.id} ${e.minLines}${e.deferred ? ' deferred' : ''}`)]);

const SPEC_ACTION_BASE_POWER = [
  ['guard', 0, 2],
  ['shield_bash', 1, 1],
  ['attack', 2, 0],
];
const M2_EFFECTS = [
  ['guard', ['reflect 2 deferred', 'reflect 3 deferred', 'guard_keep 4 deferred']],
  ['shield_bash', ['stun 2 deferred']],
  ['attack', ['ignore_guard 2', 'weaken 3 deferred', 'double_hit 4 deferred']],
];

describe('M2.5 data (m25-multispin-spec 6.1, AC-6.1, AC-6.3)', () => {
  it('starting reels are A1 x3, G1 x2, S1 x2 on all three reels (21 symbols); 3 spins per turn', () => {
    const reel = reelFromNotation('A1 A1 A1 G1 G1 S1 S1');
    expect(APPRENTICE_KNIGHT.startingReels).toEqual([reel, reel, reel]);
    expect(APPRENTICE_KNIGHT.startingReels.flat()).toHaveLength(21);
    expect(APPRENTICE_KNIGHT).toMatchObject({ maxHp: 50, spinsPerTurn: 3, skillActionId: 'shield_bash' });
  });

  it('STANDARD_TIERS is x1 / x1.5 / x2 (no fourth tier) and every action uses it', () => {
    expect(STANDARD_TIERS).toEqual([
      { lineCount: 1, multiplierNum: 2 },
      { lineCount: 2, multiplierNum: 3 },
      { lineCount: 3, multiplierNum: 4 },
    ]);
    expect(tierRows(ACTIONS)).toEqual([
      ['guard', '1:2 2:3 3:4'],
      ['shield_bash', '1:2 2:3 3:4'],
      ['attack', '1:2 2:3 3:4'],
    ]);
  });

  it('attack ignore_guard needs 3 lines; base powers and deferred thresholds are unchanged', () => {
    expect(ACTIONS.map((a) => [a.id, a.basePower.damage, a.basePower.guard])).toEqual(SPEC_ACTION_BASE_POWER);
    expect(effectRows(ACTIONS)).toEqual([
      M2_EFFECTS[0],
      M2_EFFECTS[1],
      ['attack', ['ignore_guard 3', 'weaken 3 deferred', 'double_hit 4 deferred']],
    ]);
  });

  it('STAGES follows the 6.1 enemy table in run order', () => {
    expect(stageRows(STAGES)).toEqual([
      ['slime', '슬라임', 72, 'attack 6 -> attack 6 -> guard 15'],
      ['goblin_young', '어린 고블린', 81, 'attack 5 -> attack 10 -> attack 5'],
      ['skeleton_recruit', '해골 졸병', 96, 'guard 15 -> attack 10'],
      ['goblin', '고블린', 102, 'attack 6 -> attack 10 -> attack 6'],
      ['skeleton', '해골 병사', 120, 'guard 18 -> attack 12'],
      ['ogre', '오우거', 310, 'attack 9 -> charge 2 -> attack 9 -> guard 30'],
    ]);
    expect(STAGES.map((enemy) => enemy.id)).toEqual(Object.keys(ENEMIES));
  });

  it('turn rules: Focus 50 per unused spin, spins clamped to 1..5; run rules include them', () => {
    expect(TURN_RULES).toEqual({ focusPercentPerUnusedSpin: 50, spinsPerTurnMin: 1, spinsPerTurnHardCap: 5 });
    expect(RUN_RULES).toMatchObject(TURN_RULES);
  });

  it('run rules match M2 spec 1-4 (unchanged in M2.5)', () => {
    expect(RUN_RULES).toMatchObject({
      healAfterBattle: 8,
      healBeforeBoss: 'full',
      editEveryNBattles: 3,
      reelMin: 3,
      reelMax: 12,
      offerCount: 3,
    });
    expect(RUN_RULES.actionWeights.map(({ actionId, weight }) => `${actionId} ${weight}`)).toEqual([
      'attack 40',
      'guard 30',
      'shield_bash 30',
    ]);
    const table = Object.entries(RUN_RULES.gradeWeightsByCleared).map(([k, row]) => [Number(k), row.map((g) => g.weight)]);
    expect(table).toEqual([
      [1, [80, 20, 0, 0]],
      [2, [70, 28, 2, 0]],
      [3, [55, 35, 10, 0]],
      [4, [45, 38, 15, 2]],
      [5, [35, 40, 20, 5]],
    ]);
    expect(RUN_RULES.gradeWeightsByCleared[1]?.map((g) => g.grade)).toEqual([1, 2, 3, 4]);
  });

  it('M25_RUN and createStartingBattleConfig use the M2.5 product definitions', () => {
    expect(M25_RUN).toEqual({ character: APPRENTICE_KNIGHT, stages: STAGES, actions: ACTIONS, grades: GRADES, rules: RUN_RULES });
    expect(createStartingBattleConfig('ogre')).toEqual({
      character: APPRENTICE_KNIGHT,
      enemy: ENEMIES.ogre,
      reels: APPRENTICE_KNIGHT.startingReels,
      actions: ACTIONS,
      grades: GRADES,
      turnRules: TURN_RULES,
    });
  });
});

describe('M2 regression constants stay in sync with the M2 spec (m25 6.2, AC-6.2)', () => {
  it('M2_TIERS keeps the four-tier table; M2_ACTIONS uses it with ignore_guard at 2 lines', () => {
    expect(M2_TIERS).toEqual([...STANDARD_TIERS, { lineCount: 4, multiplierNum: 6 }]);
    expect(tierRows(M2_ACTIONS).map(([, tiers]) => tiers)).toEqual(['1:2 2:3 3:4 4:6', '1:2 2:3 3:4 4:6', '1:2 2:3 3:4 4:6']);
    expect(M2_ACTIONS.map((a) => [a.id, a.basePower.damage, a.basePower.guard])).toEqual(SPEC_ACTION_BASE_POWER);
    expect(effectRows(M2_ACTIONS)).toEqual(M2_EFFECTS);
    expect(M2_ACTIONS.map((a) => a.id)).toEqual(ACTIONS.map((a) => a.id));
  });

  it('M2_STARTING_REEL is A1 x3, G1 x1, S1 x2; the M1 reel is kept', () => {
    expect(M2_STARTING_REEL).toEqual(reelFromNotation('A1 A1 A1 G1 S1 S1'));
    expect(M1_STARTING_REEL).toEqual(reelFromNotation('A1 A1 A1 G1 G1 S1'));
  });

  it('M2_CHARACTER is the apprentice knight with the M2 reels and one spin per turn', () => {
    expect(M2_CHARACTER).toEqual({
      ...APPRENTICE_KNIGHT,
      startingReels: [M2_STARTING_REEL, M2_STARTING_REEL, M2_STARTING_REEL],
      spinsPerTurn: 1,
    });
  });

  it('M2_STAGES follows the M2 spec 7 table; ids and names match ENEMIES', () => {
    expect(stageRows(M2_STAGES)).toEqual([
      ['slime', '슬라임', 24, 'attack 5 -> attack 5 -> guard 5'],
      ['goblin_young', '어린 고블린', 27, 'attack 4 -> attack 8 -> attack 4'],
      ['skeleton_recruit', '해골 졸병', 32, 'guard 5 -> attack 8'],
      ['goblin', '고블린', 34, 'attack 5 -> attack 9 -> attack 5'],
      ['skeleton', '해골 병사', 40, 'guard 6 -> attack 10'],
      ['ogre', '오우거', 90, 'attack 10 -> charge 2 -> attack 10 -> guard 10'],
    ]);
    expect(M2_STAGES.map((enemy) => [enemy.id, enemy.name])).toEqual(STAGES.map((enemy) => [enemy.id, enemy.name]));
    expect(Object.values(M2_ENEMIES)).toEqual(M2_STAGES);
  });

  it('M2_RUN and createM2BattleConfig use only the M2 constants', () => {
    expect(M2_RUN).toEqual({ character: M2_CHARACTER, stages: M2_STAGES, actions: M2_ACTIONS, grades: GRADES, rules: RUN_RULES });
    expect(createM2BattleConfig('slime')).toEqual({
      character: M2_CHARACTER,
      enemy: M2_ENEMIES.slime,
      reels: M2_CHARACTER.startingReels,
      actions: M2_ACTIONS,
      grades: GRADES,
      turnRules: TURN_RULES,
    });
    expect(M2_ACTIONS.find((a) => a.id === ACTION_ATTACK)?.effects[0]?.minLines).toBe(2);
  });
});
