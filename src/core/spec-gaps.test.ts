import { describe, expect, it } from 'vitest';
import { ACTIONS, createM1BattleConfig, GRADES } from '../data';
import { createBattle, createBattleFromState, resolveTurn, type Battle } from './battle';
import { judge } from './judge';
import { evaluateAction } from './outcome';
import { boardFromRows, EMPTY_BOARD } from './test-helpers';
import type { BattleConfig, BattleState, EnemyDef } from './types';

const SLIME = createM1BattleConfig('slime');

const MAX_LINES = 8;
const MIN_LINE_GRADE_SUM = 3;
const MAX_LINE_GRADE_SUM = 12;
const SPEC_EXAMPLE_5_DAMAGE = 3;

function stateOf(config: BattleConfig, overrides: Partial<BattleState>): Battle {
  return createBattleFromState(config, { ...createBattle(config).state, ...overrides });
}

describe('spec example 5 feasibility with M1 data (turn 4 needs 3 damage, no guard gained)', () => {
  const allOutcomes = ACTIONS.flatMap((action) =>
    Array.from({ length: MAX_LINES }, (_, index) => index + 1).flatMap((lineCount) => {
      const sums = Array.from(
        { length: MAX_LINE_GRADE_SUM * lineCount - MIN_LINE_GRADE_SUM * lineCount + 1 },
        (_, offset) => MIN_LINE_GRADE_SUM * lineCount + offset,
      );
      return sums.map((gradeSumTotal) => evaluateAction(action, { lineCount, gradeSumTotal }));
    }),
  );

  it('no M1 outcome deals exactly 3 damage without also granting guard', () => {
    const matches = allOutcomes.filter((o) => o.damage === SPEC_EXAMPLE_5_DAMAGE && o.guard === 0);
    expect(matches).toEqual([]);
  });

  it('the only way to deal 3 is a 1-line shield_bash with grade sum 3, which also grants 3 guard', () => {
    const threes = allOutcomes.filter((o) => o.damage === SPEC_EXAMPLE_5_DAMAGE);
    expect(threes).toHaveLength(1);
    expect(threes[0]).toMatchObject({ actionId: 'shield_bash', lineCount: 1, gradeSumTotal: 3, guard: 3 });
  });

  it('using that shield_bash on turn 4 changes the spec table (player ends at 38, not 35)', () => {
    const start = stateOf(SLIME, { turn: 4, playerHp: 40, enemyGuard: 5, enemyActionIndex: 3 });
    const board = boardFromRows(['S1 S1 S1', 'A1 G1 A1', 'G1 A1 G1']);
    expect(judge(board, GRADES).byAction['shield_bash']).toMatchObject({ lineCount: 1, gradeSumTotal: 3 });
    const { battle } = resolveTurn(start, board);
    expect(battle.state.playerHp).toBe(38);
  });

  it('attack damage is at least 6 (min line grade sum 3 x base 2), so never 3', () => {
    const attackDamages = allOutcomes.filter((o) => o.actionId === 'attack').map((o) => o.damage);
    expect(Math.min(...attackDamages)).toBe(6);
  });
});

describe('enemy and player guard edge rules (spec 2.6 step 7, 2.7)', () => {
  const DOUBLE_GUARD_ENEMY: EnemyDef = {
    id: 'test_double_guard',
    name: 'test',
    hp: 100,
    pattern: [
      { type: 'guard', value: 5 },
      { type: 'guard', value: 5 },
    ],
  };
  const config: BattleConfig = { ...SLIME, enemy: DOUBLE_GUARD_ENEMY };

  it('enemy guard is overwritten, not accumulated, by consecutive guard actions', () => {
    const first = resolveTurn(createBattle(config), EMPTY_BOARD).battle;
    expect(first.state.enemyGuard).toBe(5);
    const second = resolveTurn(first, EMPTY_BOARD).battle;
    expect(second.state.enemyGuard).toBe(5);
  });

  it('a guard intent never changes player HP, even with no player guard', () => {
    const { battle } = resolveTurn(createBattle(config), EMPTY_BOARD);
    expect(battle.state.playerHp).toBe(createBattle(config).state.playerHp);
  });

  it('a 6 guard against attack 5 absorbs fully and leaves 1 guard', () => {
    const ENEMY_ATTACK = 5;
    const start = createBattle(SLIME);
    // Guard from the previous turn expires at turn start, so the guard comes from this turn's board (6).
    const guardBoard = boardFromRows(['G1 G1 G1', 'A1 S1 A1', 'S1 A1 S1']);
    const { battle } = resolveTurn(start, guardBoard);
    expect(battle.state.playerGuard).toBe(6 - ENEMY_ATTACK);
    expect(battle.state.playerHp).toBe(start.state.playerHp);
  });
});
