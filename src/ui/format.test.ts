import { describe, expect, it } from 'vitest';
import { createBattle, createBattleFromState, resolveTurn, type BattleEvent } from '../core';
import { boardFromRows, EMPTY_BOARD } from '../core/test-helpers';
import { ACTION_ATTACK, ACTION_SHIELD_BASH, createM1BattleConfig } from '../data';
import { displayHp, formatBattleResult, formatEvent, formatIntent, formatMultiplier, formatTurn } from './format';

const slimeConfig = createM1BattleConfig('slime');
const TOP_ROW_ATTACK_BOARD = boardFromRows(['A1 A1 A1', 'G1 S1 G1', 'S1 G1 S1']);

describe('formatEvent', () => {
  it('describes guard absorption with the numbers from the event', () => {
    const event: BattleEvent = {
      type: 'enemy_damaged',
      actionId: ACTION_SHIELD_BASH,
      damage: 4,
      absorbed: 4,
      hpLoss: 0,
      ignoreGuard: false,
      enemyHp: 20,
      enemyGuard: 1,
    };
    expect(formatEvent(event, slimeConfig)).toBe('방패 강타 4 피해: 방어도가 4 흡수, HP -0 (슬라임 HP 20, 방어도 1)');
  });

  it('marks guard-ignoring damage and clamps negative HP for display', () => {
    const event: BattleEvent = {
      type: 'enemy_damaged',
      actionId: ACTION_ATTACK,
      damage: 9,
      absorbed: 0,
      hpLoss: 9,
      ignoreGuard: true,
      enemyHp: -3,
      enemyGuard: 5,
    };
    expect(formatEvent(event, slimeConfig)).toBe('공격 방어도 무시 9 피해: HP -9 (슬라임 HP 0, 방어도 5)');
  });

  it('formats every event type to non-empty text', () => {
    const events: BattleEvent[] = [
      { type: 'player_guard_expired', amount: 3 },
      { type: 'player_guard_gained', actionId: ACTION_SHIELD_BASH, amount: 3, playerGuard: 3 },
      { type: 'enemy_guard_expired', amount: 5 },
      { type: 'enemy_attacked', value: 5, absorbed: 3, hpLoss: 2, playerHp: 48, playerGuard: 0 },
      { type: 'enemy_guarded', value: 5, enemyGuard: 5 },
      { type: 'victory' },
      { type: 'defeat' },
    ];
    expect(events.map((event) => formatEvent(event, slimeConfig))).toEqual([
      '지난 턴의 내 방어도 3 소멸',
      '방패 강타 방어도 +3 (내 방어도 3)',
      '슬라임의 방어도 5 소멸',
      '슬라임의 공격 5 피해: 방어도가 3 흡수, HP -2 (내 HP 48, 방어도 0)',
      '슬라임 방어 태세: 방어도 5',
      '슬라임 쓰러짐 - 승리!',
      '견습 기사 쓰러짐 - 패배',
    ]);
  });
});

describe('formatTurn', () => {
  it('lists fired lines, computed values and ordered events from the report', () => {
    const { report } = resolveTurn(createBattle(slimeConfig), TOP_ROW_ATTACK_BOARD);
    expect(formatTurn(report, slimeConfig)).toEqual({
      title: '턴 1 · 적 의도 공격 5',
      sections: [
        { label: '발동 라인', items: ['H1 공격 (등급 합 3)'] },
        { label: '계산', items: ['공격: 1라인, 등급 합 3, 배율 x1 → 피해 6'] },
        {
          label: '진행',
          items: ['공격 6 피해: HP -6 (슬라임 HP 18, 방어도 0)', '슬라임의 공격 5 피해: HP -5 (내 HP 45, 방어도 0)'],
        },
      ],
    });
  });

  it('explains an empty turn and still shows the enemy action', () => {
    const { report } = resolveTurn(createBattle(slimeConfig), EMPTY_BOARD);
    const turn = formatTurn(report, slimeConfig);
    expect(turn.sections.map((section) => section.label)).toEqual(['발동 라인', '진행']);
    expect(turn.sections[0]?.items[0]).toContain('빈 턴');
    expect(turn.sections[1]?.items).toEqual(['슬라임의 공격 5 피해: HP -5 (내 HP 45, 방어도 0)']);
  });
});

describe('formatBattleResult', () => {
  it('is null while the battle is ongoing', () => {
    expect(formatBattleResult(createBattle(slimeConfig))).toBeNull();
  });

  it('summarizes a victory with clamped enemy HP', () => {
    const nearlyDead = createBattleFromState(slimeConfig, {
      turn: 4,
      playerHp: 30,
      playerGuard: 0,
      enemyHp: 1,
      enemyGuard: 0,
      enemyActionIndex: 3,
      phase: 'ongoing',
    });
    const { battle } = resolveTurn(nearlyDead, TOP_ROW_ATTACK_BOARD);
    expect(formatBattleResult(battle)).toEqual({
      phase: 'victory',
      title: '승리!',
      summary: '4턴 · 슬라임 HP 0/24 · 내 HP 30/50',
    });
  });
});

describe('small formatters', () => {
  it('formats intents, multipliers and display HP', () => {
    expect(formatIntent({ type: 'guard', value: 5 })).toBe('방어 5');
    expect(formatMultiplier(3)).toBe('x1.5');
    expect(displayHp(-4)).toBe(0);
    expect(displayHp(7)).toBe(7);
  });
});
