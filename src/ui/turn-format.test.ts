import { describe, expect, it } from 'vitest';
import {
  createBattle,
  createBattleFromState,
  previewStop,
  resolveTurn,
  stopSpinning,
  submitSpin,
  type Battle,
  type BattleConfig,
  type BattleState,
  type Board,
} from '../core';
import { createM2BattleConfig, createStartingBattleConfig, type EnemyId } from '../data';
import { boardFromRows, EMPTY_BOARD } from '../test-support/test-helpers';
import {
  formatContinueEstimate,
  formatGuard,
  formatSpinCaption,
  formatSpinCounter,
  formatSpinLines,
  formatStopPreview,
  formatTurn,
  formatTurnStartHint,
  pooledActionTexts,
  spinAgainLabel,
  stopLabel,
  TURN_TEXT,
} from './turn-format';

const MAX_HP = 50;
// M2.5 spec section 10 boards (rows top to bottom).
const EMPTY_SPIN_BOARD = boardFromRows(['A1 G1 S1', 'G1 S1 A1', 'A1 A1 G1']);

function battleAt(enemyId: EnemyId, overrides: Partial<BattleState> = {}): Battle {
  const config = createStartingBattleConfig(enemyId);
  return createBattleFromState(config, { ...createBattle(config).state, ...overrides });
}

/** Submits the boards in order; the battle is left spinning unless the last board reached the max. */
function spun(battle: Battle, boards: readonly Board[]): Battle {
  return boards.reduce((current, board) => submitSpin(current, board).battle, battle);
}

function names(battle: Battle): BattleConfig {
  return battle.config;
}

describe('per-spin lines (U2)', () => {
  it('names each fired line "H1 공격 3" and an empty spin "빈 스핀"', () => {
    const battle = battleAt('slime');
    const first = submitSpin(battle, boardFromRows(['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1'])).spin;
    expect(formatSpinLines(first.judgement.firedLines, battle.config)).toEqual(['H1 공격 3', 'H2 방어 3']);
    expect(formatSpinCaption(first, battle.config)).toBe('스핀 1: H1 공격 3 / H2 방어 3');
    const empty = submitSpin(battle, EMPTY_SPIN_BOARD).spin;
    expect(empty.empty).toBe(true);
    expect(formatSpinCaption(empty, battle.config)).toBe(`스핀 1: ${TURN_TEXT.emptySpin}`);
  });
});

describe('counter, guard and buttons (U4, U8, U12)', () => {
  it('formats the spin counter, the turn start hint and the button labels from engine values', () => {
    expect(formatSpinCounter(1, 3, 2)).toBe('사용 1 / 최대 3 · 남은 2');
    expect(formatTurnStartHint({ maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 })).toBe(
      '한 턴에 최대 3회 스핀 · 남기는 스핀 1회당 집중 +50%',
    );
    expect(spinAgainLabel(2)).toBe('🎰 한 번 더 (남은 2)');
    expect(stopLabel(100)).toBe('✋ 멈춤 (+100%)');
  });

  it('shows the pending guard only while there is one', () => {
    expect(formatGuard(0, 12)).toBe('🛡️ 방어도 0 (멈추면 +12)');
    expect(formatGuard(5, 0)).toBe('🛡️ 방어도 5');
  });
});

describe('pooled status and stop preview (U3, U5): spec section 10 examples', () => {
  it('example 1: guard and attack 1 line each, next-tier and ignore_guard hints, Focus +100%', () => {
    const battle = spun(battleAt('slime'), [boardFromRows(['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1'])]);
    const preview = previewStop(battle);
    expect(pooledActionTexts(preview, names(battle))).toEqual([
      { actionId: 'guard', title: '🛡️ 방어', detail: '1줄 · 등급 합 3 · x1', hint: '1줄 더 → x1.5', value: '방어도 12' },
      {
        actionId: 'attack',
        title: '⚔️ 공격',
        detail: '1줄 · 등급 합 3 · x1',
        hint: '1줄 더 → x1.5 · 3줄 → 방어도 무시',
        value: '피해 12',
      },
    ]);
    expect(formatStopPreview(preview, MAX_HP)).toEqual([
      '지금 멈추면 피해 12 / 방어 12 / 집중 +100%',
      '적 행동 후 내 HP 50/50 (적 공격 6)',
    ]);
  });

  it('example 2: pooled attack 3 lines across spins reads "최대 단계" with ignore_guard on', () => {
    const start = battleAt('skeleton', { enemyHp: 95, enemyGuard: 18, playerHp: 30, enemyActionIndex: 1 });
    const battle = spun(start, [
      boardFromRows(['A1 A1 A2', 'A1 S1 G1', 'A1 G1 S1']),
      boardFromRows(['S1 A1 G1', 'A1 A1 A1', 'G1 S1 S1']),
    ]);
    const preview = previewStop(battle);
    expect(pooledActionTexts(preview, names(battle))).toEqual([
      {
        actionId: 'attack',
        title: '⚔️ 공격',
        detail: '3줄 · 등급 합 10 · x2',
        hint: TURN_TEXT.topTier,
        value: '피해 60, 방어도 무시',
      },
    ]);
    expect(formatStopPreview(preview, MAX_HP)).toEqual([
      '지금 멈추면 피해 60 / 방어 0 / 집중 +50%',
      '적 행동 후 내 HP 18/50 (적 공격 12)',
    ]);
  });

  it('example 5: a lethal stop says the enemy dies and does not act', () => {
    const battle = spun(battleAt('slime', { enemyHp: 30 }), [boardFromRows(['A1 A1 A1', 'G1 S1 G1', 'A1 A1 A2'])]);
    expect(formatStopPreview(previewStop(battle), MAX_HP)).toEqual([
      '지금 멈추면 피해 42 / 방어 0 / 집중 +100%',
      TURN_TEXT.lethal,
    ]);
  });

  it('example 4b: nothing pooled yet -> "지금 멈추면 아무 일도 없음", no action rows, enemy still hits', () => {
    const battle = spun(battleAt('goblin_young', { playerHp: 25, enemyActionIndex: 1 }), [EMPTY_SPIN_BOARD]);
    const preview = previewStop(battle);
    expect(pooledActionTexts(preview, names(battle))).toEqual([]);
    expect(formatStopPreview(preview, MAX_HP)).toEqual([TURN_TEXT.nothingIfStopped, '적 행동 후 내 HP 15/50 (적 공격 10)']);
  });

  it('a non-attacking intent shows the HP without an incoming value', () => {
    const battle = spun(battleAt('skeleton'), [EMPTY_SPIN_BOARD]);
    expect(formatStopPreview(previewStop(battle), MAX_HP)[1]).toBe('적 행동 후 내 HP 50/50');
  });
});

describe('formatContinueEstimate (U6)', () => {
  it('labels the values as an average with the sample count', () => {
    expect(formatContinueEstimate({ samples: 200, averageDamage: 9.254, averageGuard: 3, lethalChance: 0.125 })).toBe(
      '한 번 더 돌리면(평균) 피해 9.3 / 방어 3.0 · 처치 12.5% (표본 200)',
    );
  });
});

describe('formatTurn: settlement log (U10, U11)', () => {
  it('example 3: every spin, spins used / unused / Focus, final power per action and events in order', () => {
    const start = battleAt('ogre', { enemyHp: 200, playerHp: 40, enemyActionIndex: 2, enemyChargeMult: 2 });
    const spins = [
      EMPTY_SPIN_BOARD,
      boardFromRows(['S1 S1 S1', 'A1 G1 A1', 'A1 A1 A1']),
      boardFromRows(['G1 G1 G1', 'A2 A1 A1', 'S1 S1 G1']),
    ];
    const last = submitSpin(spun(start, spins.slice(0, -1)), spins[2] as Board);
    const report = last.result?.report;
    if (!report) throw new Error('example 3 must settle at the max');
    expect(formatTurn(report, start.config)).toEqual({
      title: '턴 1 · 적 의도 공격 18 (강화됨 · 기본 9)',
      sections: [
        { label: '스핀', items: ['스핀 1: 빈 스핀', '스핀 2: H1 방패 강타 3 / H3 공격 3', '스핀 3: H1 방어 3 / H2 공격 4'] },
        { label: '정산', items: ['사용 3 / 최대 3 · 남은 0 → 집중 +0% (최대 도달 - 자동 정산)'] },
        {
          label: '계산',
          items: [
            '방어: 1줄, 등급 합 3, 배율 x1 → 방어도 6',
            '방패 강타: 1줄, 등급 합 3, 배율 x1 → 피해 3, 방어도 3',
            '공격: 2줄, 등급 합 7, 배율 x1.5 → 피해 21',
          ],
        },
        {
          label: '진행',
          items: [
            '방어 방어도 +6 (내 방어도 6)',
            '방패 강타 3 피해: HP -3 (오우거 HP 197, 방어도 0)',
            '방패 강타 방어도 +3 (내 방어도 9)',
            '공격 21 피해: HP -21 (오우거 HP 176, 방어도 0)',
            '오우거의 공격 18 피해: 방어도가 9 흡수, HP -9 (내 HP 31, 방어도 0)',
          ],
        },
      ],
    });
  });

  it('example 1 stopped after one spin: Focus +100% on the outcomes and the player-stop reason', () => {
    const battle = spun(battleAt('slime'), [boardFromRows(['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1'])]);
    const { sections } = formatTurn(stopSpinning(battle).report, battle.config);
    expect(sections.find((section) => section.label === '정산')?.items).toEqual([
      '사용 1 / 최대 3 · 남은 2 → 집중 +100% (멈춤)',
    ]);
    expect(sections.find((section) => section.label === '계산')?.items).toEqual([
      '방어: 1줄, 등급 합 3, 배율 x1, 집중 +100% → 방어도 12',
      '공격: 1줄, 등급 합 3, 배율 x1, 집중 +100% → 피해 12',
    ]);
  });

  it('example 4: an empty turn says so, distinct from an empty spin, and still shows the enemy action', () => {
    const start = battleAt('goblin_young', { playerHp: 25, enemyActionIndex: 1 });
    const report = stopSpinning(spun(start, [EMPTY_SPIN_BOARD])).report;
    expect(report.empty).toBe(true);
    const { sections } = formatTurn(report, start.config);
    expect(sections.map((section) => section.items)).toEqual([
      [`스핀 1: ${TURN_TEXT.emptySpin}`],
      ['사용 1 / 최대 3 · 남은 2 → 집중 +100% (멈춤)'],
      [TURN_TEXT.emptyTurn],
      ['어린 고블린의 공격 10 피해: HP -10 (내 HP 15, 방어도 0)'],
    ]);
    expect(TURN_TEXT.emptyTurn).not.toBe(TURN_TEXT.emptySpin);
  });

  it('a one-spin M2 turn settles at the max with no Focus text', () => {
    const config = createM2BattleConfig('slime');
    const { report } = resolveTurn(createBattle(config), EMPTY_BOARD);
    const { sections } = formatTurn(report, config);
    expect(sections[1]?.items).toEqual(['사용 1 / 최대 1 · 남은 0 → 집중 +0% (최대 도달 - 자동 정산)']);
    expect(sections[2]?.items).toEqual([TURN_TEXT.emptyTurn]);
  });
});
