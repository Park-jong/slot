import { describe, expect, it } from 'vitest';
import { reelFromNotation } from '../test-support/test-helpers';
import { APPRENTICE_KNIGHT, M1_STARTING_REEL, RUN_RULES, STAGES } from '.';

const intents = (pattern: readonly { type: string; value: number }[]) => pattern.map((i) => `${i.type} ${i.value}`).join(' -> ');

describe('M2 data (spec 5, 7 and 11)', () => {
  it('starting reels are A1 x3, G1 x1, S1 x2 on all three reels; the M1 reel is kept', () => {
    const m2Reel = reelFromNotation('A1 A1 A1 G1 S1 S1');
    expect(APPRENTICE_KNIGHT.startingReels).toEqual([m2Reel, m2Reel, m2Reel]);
    expect(M1_STARTING_REEL).toEqual(reelFromNotation('A1 A1 A1 G1 G1 S1'));
  });

  it('STAGES follows the spec 7 table', () => {
    expect(STAGES.map((enemy) => [enemy.id, enemy.name, enemy.hp, intents(enemy.pattern)])).toEqual([
      ['slime', '슬라임', 24, 'attack 5 -> attack 5 -> guard 5'],
      ['goblin_young', '어린 고블린', 27, 'attack 4 -> attack 8 -> attack 4'],
      ['skeleton_recruit', '해골 졸병', 32, 'guard 5 -> attack 8'],
      ['goblin', '고블린', 34, 'attack 5 -> attack 9 -> attack 5'],
      ['skeleton', '해골 병사', 40, 'guard 6 -> attack 10'],
      ['ogre', '오우거', 90, 'attack 10 -> charge 2 -> attack 10 -> guard 10'],
    ]);
  });

  it('run rules match spec 1-4', () => {
    expect(RUN_RULES).toMatchObject({
      healAfterBattle: 8,
      healBeforeBoss: 'full',
      editEveryNBattles: 3,
      reelMin: 3,
      reelMax: 12,
      offerCount: 3,
    });
    expect(APPRENTICE_KNIGHT.maxHp).toBe(50);
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
});
