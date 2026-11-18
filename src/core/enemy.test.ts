import { describe, expect, it } from 'vitest';
import { createM2BattleConfig } from '../data';
import { EMPTY_BOARD, SINGLE_ATTACK_BOARD, SINGLE_GUARD_BOARD } from '../test-support/test-helpers';
import { createBattle, createBattleFromState, currentIntentPreview, resolveTurn, type Battle } from './battle';
import type { BattleConfig, Board, EnemyDef } from './types';

const OGRE = createM2BattleConfig('ogre');

function playBoards(battle: Battle, boards: readonly Board[]) {
  let current = battle;
  return boards.map((board) => {
    const preview = currentIntentPreview(current);
    const result = resolveTurn(current, board);
    current = result.battle;
    return { preview, ...result };
  });
}

describe('M2 example 4: ogre charge -> attack (player starts at 50)', () => {
  // Turns 1, 2 empty; turn 3 one guard line (grade sum 3 -> guard 6); turns 4, 5 empty.
  const turns = playBoards(createBattle(OGRE), [EMPTY_BOARD, EMPTY_BOARD, SINGLE_GUARD_BOARD, EMPTY_BOARD, EMPTY_BOARD]);

  it('matches the spec table: pattern index, player HP and multiplier after each turn', () => {
    const rows = turns.map(({ report }) => ({
      index: report.before.enemyActionIndex,
      playerHp: report.after.playerHp,
      mult: report.after.enemyChargeMult,
    }));
    expect(rows).toEqual([
      { index: 0, playerHp: 40, mult: 1 },
      { index: 1, playerHp: 40, mult: 2 },
      { index: 2, playerHp: 26, mult: 1 },
      { index: 3, playerHp: 26, mult: 1 },
      { index: 4, playerHp: 16, mult: 1 },
    ]);
    expect(turns[3]?.report.after.enemyGuard).toBe(10);
  });

  it('previews each turn as in the spec', () => {
    expect(turns.map(({ preview }) => preview)).toEqual([
      { type: 'attack', value: 10, baseValue: 10, charged: false },
      {
        type: 'charge',
        value: 2,
        baseValue: 2,
        charged: false,
        next: { type: 'attack', value: 20, baseValue: 10, charged: true },
      },
      { type: 'attack', value: 20, baseValue: 10, charged: true },
      { type: 'guard', value: 10, baseValue: 10, charged: false },
      { type: 'attack', value: 10, baseValue: 10, charged: false },
    ]);
  });

  it('emits enemy_charged on turn 2 and the boosted enemy_attacked on turn 3', () => {
    expect(turns[1]?.report.events).toEqual([{ type: 'enemy_charged', multiplier: 2 }]);
    expect(turns[2]?.report.events).toEqual([
      { type: 'player_guard_gained', actionId: 'guard', amount: 6, playerGuard: 6 },
      { type: 'enemy_attacked', value: 20, baseValue: 10, absorbed: 6, hpLoss: 14, playerHp: 26, playerGuard: 0 },
    ]);
    expect(turns[4]?.report.events).toEqual([
      { type: 'enemy_guard_expired', amount: 10 },
      { type: 'enemy_attacked', value: 10, baseValue: 10, absorbed: 0, hpLoss: 10, playerHp: 16, playerGuard: 0 },
    ]);
  });

  it('(a) killing the ogre on the charge turn ends the battle; the multiplier is never set', () => {
    const turn2 = createBattleFromState(OGRE, { ...createBattle(OGRE).state, turn: 2, playerHp: 40, enemyHp: 6, enemyActionIndex: 1 });
    const { battle, report } = resolveTurn(turn2, SINGLE_ATTACK_BOARD);
    expect(battle.state).toMatchObject({ phase: 'victory', enemyChargeMult: 1, playerHp: 40 });
    expect(report.events.map((event) => event.type)).toEqual(['enemy_damaged', 'victory']);
  });
});

describe('charge edge cases', () => {
  const enemyWith = (pattern: EnemyDef['pattern']): BattleConfig => ({
    ...OGRE,
    enemy: { id: 'test_charger', name: 'test', hp: 100, pattern },
  });

  it('(b) [charge x2, guard 5, attack 10]: guard keeps the charge, the attack lands as 20', () => {
    const config = enemyWith([
      { type: 'charge', value: 2 },
      { type: 'guard', value: 5 },
      { type: 'attack', value: 10 },
    ]);
    const turns = playBoards(createBattle(config), [EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD]);
    expect(turns[0]?.preview).toEqual({
      type: 'charge',
      value: 2,
      baseValue: 2,
      charged: false,
      next: { type: 'guard', value: 5, baseValue: 5, charged: false },
    });
    expect(turns[1]?.report.after).toMatchObject({ enemyChargeMult: 2, enemyGuard: 5 });
    expect(turns[2]?.preview).toEqual({ type: 'attack', value: 20, baseValue: 10, charged: true });
    expect(turns[2]?.report.events.at(-1)).toMatchObject({ type: 'enemy_attacked', value: 20, baseValue: 10, hpLoss: 20 });
    expect(turns[2]?.report.after).toMatchObject({ playerHp: 30, enemyChargeMult: 1 });
  });

  it('consecutive charges overwrite the multiplier instead of stacking', () => {
    const config = enemyWith([
      { type: 'charge', value: 2 },
      { type: 'charge', value: 3 },
      { type: 'attack', value: 10 },
    ]);
    const turns = playBoards(createBattle(config), [EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD]);
    expect(turns[1]?.report.after.enemyChargeMult).toBe(3);
    expect(turns[1]?.preview.next).toEqual({ type: 'attack', value: 30, baseValue: 10, charged: true });
    expect(turns[2]?.report.after.playerHp).toBe(20);
  });

  it('every battle starts uncharged', () => {
    expect(createBattle(OGRE).state.enemyChargeMult).toBe(1);
  });
});
