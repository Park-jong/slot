import { describe, expect, it } from 'vitest';
import { createM2BattleConfig, M2_ACTIONS, M2_TIERS } from '../data';
import {
  createBattle,
  createBattleFromState,
  currentIntent,
  isBattleOver,
  playTurn,
  resolveTurn,
  type Battle,
} from './battle';
import { createRng } from './rng';
import { spin } from './spin';
import {
  boardFromRows,
  deepFreeze,
  EMPTY_BOARD,
  SINGLE_ATTACK_BOARD,
  SINGLE_GUARD_BOARD,
  TEST_ACTION_POKE,
} from '../test-support/test-helpers';
import type { ActionDef, BattleConfig, BattleState, Board } from './types';

// M1/M2 regression: M2 numbers with one spin per turn, so resolveTurn is exactly the M2 turn (M2.5 spec 6.2).
const SLIME = createM2BattleConfig('slime');
const GOBLIN = createM2BattleConfig('goblin');

const EXAMPLE_3_BOARD = boardFromRows(['G1 S1 A1', 'G1 S2 A1', 'G2 S1 A1']);
const FULL_ATTACK_BOARD = boardFromRows(['A1 A1 A1', 'A1 A1 A1', 'A1 A1 A1']);

function stateOf(config: BattleConfig, overrides: Partial<BattleState>): Battle {
  return createBattleFromState(config, { ...createBattle(config).state, ...overrides });
}

function playBoards(battle: Battle, boards: readonly Board[]) {
  let current = battle;
  return boards.map((board) => {
    const result = resolveTurn(current, board);
    current = result.battle;
    return result;
  });
}

describe('createBattle', () => {
  it('starts from character max HP and enemy HP', () => {
    expect(createBattle(SLIME).state).toEqual({
      turn: 1,
      playerHp: 50,
      playerGuard: 0,
      enemyHp: 24,
      enemyGuard: 0,
      enemyActionIndex: 0,
      enemyChargeMult: 1,
      phase: 'ongoing',
    });
    expect(currentIntent(createBattle(GOBLIN))).toEqual({ type: 'attack', value: 5 });
  });

  it('starts from startingHp when given (HP carried over in a run)', () => {
    expect(createBattle({ ...SLIME, startingHp: 36 }).state.playerHp).toBe(36);
  });

  it.each([0, -1, 51, 2.5])('rejects startingHp %s outside 1..maxHp', (startingHp) => {
    expect(() => createBattle({ ...SLIME, startingHp })).toThrow(/startingHp/);
  });

  it('rejects a reel count other than the grid size', () => {
    const reels = SLIME.reels.slice(0, 2);
    expect(() => createBattle({ ...SLIME, reels })).toThrow(/expected 3 reels/);
  });

  it('rejects a character whose skill action is not defined', () => {
    const character = { ...SLIME.character, skillActionId: 'fireball' };
    expect(() => createBattle({ ...SLIME, character })).toThrow(/skill action fireball/);
  });

  it('rejects a charge multiplier below 2', () => {
    const enemy = { ...SLIME.enemy, pattern: [{ type: 'charge', value: 1 }] } as const;
    expect(() => createBattle({ ...SLIME, enemy })).toThrow(/charge multiplier 1/);
  });

  it('rejects non-deferred effects the engine does not implement', () => {
    const actions = M2_ACTIONS.map((action) =>
      action.id === 'guard'
        ? { ...action, effects: action.effects.map((effect) => ({ ...effect, deferred: false })) }
        : action,
    );
    expect(() => createBattle({ ...SLIME, actions })).toThrow(/reflect/);
  });

  it('rejects reels that use an unknown action', () => {
    const reel = [{ actionId: 'fireball', grade: 1 }, ...(SLIME.reels[0] ?? [])];
    expect(() => createBattle({ ...SLIME, reels: [reel, reel, reel] })).toThrow(/fireball/);
  });
});

describe('spec example 3: guard + shield_bash + attack on slime turn 4', () => {
  const start = stateOf(SLIME, { turn: 4, enemyGuard: 5, enemyActionIndex: 3 });
  const { battle, report } = resolveTurn(start, EXAMPLE_3_BOARD);

  it('shows intent pattern[3 % 3] = attack 5', () => {
    expect(report.intent).toEqual({ type: 'attack', value: 5 });
  });

  it('runs every step in order with the spec numbers', () => {
    expect(report.events).toEqual([
      { type: 'player_guard_gained', actionId: 'guard', amount: 8, playerGuard: 8 },
      {
        type: 'enemy_damaged',
        actionId: 'shield_bash',
        damage: 4,
        absorbed: 4,
        hpLoss: 0,
        ignoreGuard: false,
        enemyHp: 24,
        enemyGuard: 1,
      },
      { type: 'player_guard_gained', actionId: 'shield_bash', amount: 4, playerGuard: 12 },
      {
        type: 'enemy_damaged',
        actionId: 'attack',
        damage: 6,
        absorbed: 1,
        hpLoss: 5,
        ignoreGuard: false,
        enemyHp: 19,
        enemyGuard: 0,
      },
      { type: 'enemy_attacked', value: 5, baseValue: 5, absorbed: 5, hpLoss: 0, playerHp: 50, playerGuard: 7 },
    ]);
  });

  it('ends at playerHp 50, playerGuard 7, enemyHp 19, enemyGuard 0, enemyActionIndex 4', () => {
    expect(battle.state).toEqual({
      turn: 5,
      playerHp: 50,
      playerGuard: 7,
      enemyHp: 19,
      enemyGuard: 0,
      enemyActionIndex: 4,
      enemyChargeMult: 1,
      phase: 'ongoing',
    });
    expect(report.before).toBe(start.state);
    expect(report.after).toBe(battle.state);
  });
});

describe('spec example 2: ignore_guard', () => {
  it('puts all 27 damage into HP and leaves enemy guard at 5', () => {
    const start = stateOf(SLIME, { enemyHp: 100, enemyGuard: 5 });
    const { report } = resolveTurn(start, boardFromRows(['A1 A1 G1', 'A2 A1 G1', 'A1 A3 G2']));
    expect(report.events).toContainEqual({
      type: 'enemy_damaged',
      actionId: 'attack',
      damage: 27,
      absorbed: 0,
      hpLoss: 27,
      ignoreGuard: true,
      enemyHp: 73,
      enemyGuard: 5,
    });
  });
});

describe('spec example 5: enemy guard lifetime on slime turns 1-4', () => {
  // The spec table needs a 3-damage hit with no player guard gained. M1 attack cannot do it (its minimum
  // damage is 6: one line, grade sum 3, x1), and shield_bash also grants guard, which would change player
  // HP; so this test uses a damage-only test action. The next block covers the same turn with shield_bash.
  const POKE: ActionDef = {
    id: TEST_ACTION_POKE,
    name: 'poke',
    basePower: { damage: 1, guard: 0 },
    tiers: M2_TIERS,
    effects: [],
  };
  const config: BattleConfig = { ...SLIME, actions: [...M2_ACTIONS, POKE] };
  const pokeBoard = boardFromRows(['P1 P1 P1', 'G1 G1 A1', 'A1 A1 G1']);
  const results = playBoards(createBattle(config), [EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD, pokeBoard]);

  it('matches the spec table row by row', () => {
    const rows = results.map(({ report: { turn, before, intent, after } }) => ({
      turn,
      startGuard: before.enemyGuard,
      startIndex: before.enemyActionIndex,
      intent: `${intent.type} ${intent.value}`,
      endGuard: after.enemyGuard,
      endIndex: after.enemyActionIndex,
      playerHp: after.playerHp,
      enemyHp: after.enemyHp,
    }));
    expect(rows).toEqual([
      { turn: 1, startGuard: 0, startIndex: 0, intent: 'attack 5', endGuard: 0, endIndex: 1, playerHp: 45, enemyHp: 24 },
      { turn: 2, startGuard: 0, startIndex: 1, intent: 'attack 5', endGuard: 0, endIndex: 2, playerHp: 40, enemyHp: 24 },
      { turn: 3, startGuard: 0, startIndex: 2, intent: 'guard 5', endGuard: 5, endIndex: 3, playerHp: 40, enemyHp: 24 },
      { turn: 4, startGuard: 5, startIndex: 3, intent: 'attack 5', endGuard: 0, endIndex: 4, playerHp: 35, enemyHp: 24 },
    ]);
  });

  it('turn 4: guard absorbs 3 of 5, then the remaining 2 expires before the enemy acts', () => {
    const turn4 = results[3]?.report;
    expect(turn4?.events).toEqual([
      {
        type: 'enemy_damaged',
        actionId: TEST_ACTION_POKE,
        damage: 3,
        absorbed: 3,
        hpLoss: 0,
        ignoreGuard: false,
        enemyHp: 24,
        enemyGuard: 2,
      },
      { type: 'enemy_guard_expired', amount: 2 },
      { type: 'enemy_attacked', value: 5, baseValue: 5, absorbed: 0, hpLoss: 5, playerHp: 35, playerGuard: 0 },
    ]);
  });
});

describe('spec example 5 with M1 data: shield_bash S1x3 on slime turn 4', () => {
  // Only H1 fires: one shield_bash line, grade sum 3 -> damage 3 and guard 3.
  const shieldBashBoard = boardFromRows(['S1 S1 S1', 'G1 G1 A1', 'A1 A1 G1']);
  const results = playBoards(createBattle(SLIME), [EMPTY_BOARD, EMPTY_BOARD, EMPTY_BOARD, shieldBashBoard]);
  const turn4 = results[3]?.report;

  it('enters turn 4 with the spec state: player HP 40, enemy guard 5, intent attack 5', () => {
    expect(turn4?.before).toMatchObject({ turn: 4, playerHp: 40, enemyGuard: 5, enemyActionIndex: 3 });
    expect(turn4?.intent).toEqual({ type: 'attack', value: 5 });
  });

  it('enemy guard 5 -> 2 from the hit, then expires at the enemy action; player guard 3 leaves HP at 38', () => {
    expect(turn4?.events).toEqual([
      {
        type: 'enemy_damaged',
        actionId: 'shield_bash',
        damage: 3,
        absorbed: 3,
        hpLoss: 0,
        ignoreGuard: false,
        enemyHp: 24,
        enemyGuard: 2,
      },
      { type: 'player_guard_gained', actionId: 'shield_bash', amount: 3, playerGuard: 3 },
      { type: 'enemy_guard_expired', amount: 2 },
      { type: 'enemy_attacked', value: 5, baseValue: 5, absorbed: 3, hpLoss: 2, playerHp: 38, playerGuard: 0 },
    ]);
    expect(turn4?.after).toMatchObject({ turn: 5, playerHp: 38, enemyHp: 24, enemyGuard: 0, enemyActionIndex: 4 });
  });
});

describe('player guard lifetime', () => {
  it('lasts through the enemy action of the same turn and resets at the next turn start', () => {
    const start = stateOf(SLIME, { enemyActionIndex: 2 });
    const [guardTurn, nextTurn] = playBoards(start, [SINGLE_GUARD_BOARD, EMPTY_BOARD]);
    expect(guardTurn?.report.after).toMatchObject({ playerGuard: 6, enemyGuard: 5, playerHp: 50 });
    expect(nextTurn?.report.events).toEqual([
      { type: 'player_guard_expired', amount: 6 },
      { type: 'enemy_guard_expired', amount: 5 },
      { type: 'enemy_attacked', value: 5, baseValue: 5, absorbed: 0, hpLoss: 5, playerHp: 45, playerGuard: 0 },
    ]);
  });
});

describe('enemy pattern cycling', () => {
  const intentsOver = (config: BattleConfig, turns: number) =>
    playBoards(createBattle(config), Array.from({ length: turns }, () => EMPTY_BOARD)).map(
      ({ report }) => `${report.intent.type} ${report.intent.value}`,
    );

  it('slime repeats attack 5 -> attack 5 -> guard 5', () => {
    expect(intentsOver(SLIME, 7)).toEqual([
      'attack 5', 'attack 5', 'guard 5', 'attack 5', 'attack 5', 'guard 5', 'attack 5',
    ]);
  });

  it('goblin repeats attack 5 -> attack 9 -> attack 5 and HP drops accordingly', () => {
    expect(intentsOver(GOBLIN, 7)).toEqual([
      'attack 5', 'attack 9', 'attack 5', 'attack 5', 'attack 9', 'attack 5', 'attack 5',
    ]);
    const results = playBoards(createBattle(GOBLIN), Array.from({ length: 7 }, () => EMPTY_BOARD));
    expect(results.map(({ report }) => report.after.playerHp)).toEqual([45, 36, 31, 26, 17, 12, 7]);
  });
});

describe('turn edge cases', () => {
  it('empty turn: no player events, enemy acts normally', () => {
    const { battle, report } = resolveTurn(createBattle(SLIME), EMPTY_BOARD);
    expect(report.judgement.firedLines).toEqual([]);
    expect(report.outcomes).toEqual([]);
    expect(report.events).toEqual([
      { type: 'enemy_attacked', value: 5, baseValue: 5, absorbed: 0, hpLoss: 5, playerHp: 45, playerGuard: 0 },
    ]);
    expect(battle.state).toMatchObject({ turn: 2, enemyHp: 24, enemyActionIndex: 1 });
  });

  it('victory when enemy HP reaches 0: the enemy does not act and the turn does not advance', () => {
    const start = stateOf(SLIME, { enemyHp: 6 });
    const { battle, report } = resolveTurn(start, SINGLE_ATTACK_BOARD);
    expect(battle.state).toEqual({ ...start.state, enemyHp: 0, phase: 'victory' });
    expect(report.events.map((event) => event.type)).toEqual(['enemy_damaged', 'victory']);
  });

  it('defeat when player HP reaches 0 after the enemy acts', () => {
    const start = stateOf(SLIME, { playerHp: 5 });
    const { battle, report } = resolveTurn(start, EMPTY_BOARD);
    expect(battle.state).toMatchObject({ playerHp: 0, phase: 'defeat', turn: 1, enemyActionIndex: 1 });
    expect(report.events.at(-1)).toEqual({ type: 'defeat' });
  });

  it('8-line full attack board: capped at tier 4, 144 damage ignoring guard, overkill allowed', () => {
    const start = stateOf(SLIME, { enemyGuard: 5 });
    const { battle, report } = resolveTurn(start, FULL_ATTACK_BOARD);
    expect(report.outcomes).toEqual([
      { actionId: 'attack', lineCount: 8, gradeSumTotal: 24, multiplierNum: 6, damage: 144, guard: 0, ignoreGuard: true, focusPct: 0, damagePct: 0 },
    ]);
    expect(battle.state).toMatchObject({ enemyHp: -120, enemyGuard: 5, phase: 'victory' });
  });

  it('locks the battle once it has ended', () => {
    const won = resolveTurn(stateOf(SLIME, { enemyHp: 1 }), SINGLE_ATTACK_BOARD).battle;
    const lost = resolveTurn(stateOf(SLIME, { playerHp: 1 }), EMPTY_BOARD).battle;
    for (const ended of [won, lost]) {
      expect(isBattleOver(ended)).toBe(true);
      expect(() => resolveTurn(ended, EMPTY_BOARD)).toThrow(/already ended/);
      expect(() => playTurn(ended, createRng(1))).toThrow(/already ended/);
    }
  });

  it('rejects boards containing actions missing from the config', () => {
    const board = boardFromRows(['P1 P1 P1', 'G1 G1 A1', 'A1 A1 G1']);
    expect(() => resolveTurn(createBattle(SLIME), board)).toThrow(/unknown actions poke/);
  });
});

describe('playTurn', () => {
  it('equals spin + resolveTurn with the same rng and is reproducible by seed', () => {
    const battle = createBattle(GOBLIN);
    const viaPlay = playTurn(battle, createRng(99));
    const viaSteps = resolveTurn(battle, spin(GOBLIN.reels, createRng(99)));
    expect(viaPlay).toEqual(viaSteps);
    expect(playTurn(battle, createRng(99))).toEqual(viaPlay);
  });

  it('never mutates the input battle', () => {
    const battle = deepFreeze(createBattle(SLIME));
    const snapshot = structuredClone(battle.state);
    const rng = createRng(5);
    let current = battle;
    while (!isBattleOver(current)) current = playTurn(current, rng).battle;
    expect(battle.state).toEqual(snapshot);
  });
});
