import { describe, expect, it } from 'vitest';
import { analyzeReels, previewEdit, startRun } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, ACTIONS, M25_RUN, M2_RUN } from '../data';
import { analysisOptions } from './edit-candidates';
import {
  displayActionIds,
  formatCompositionEntry,
  formatPercent,
  formatReelTitle,
  formatSymbol,
  formatTurnBasis,
  statRows,
  type StatRow,
} from './reel-format';

// M2 regression run: one spin per turn, so the M2 spec section 9 numbers hold.
const START_REELS = M2_RUN.character.startingReels;
const OPTIONS = analysisOptions(startRun(M2_RUN));

function rowsOf(edit: Parameters<typeof previewEdit>[1]): StatRow[] {
  return statRows(previewEdit(START_REELS, edit, OPTIONS), M2_RUN);
}

describe('symbol and reel text', () => {
  it('names symbols with icon, action and grade, and numbers reels from 1', () => {
    expect(formatSymbol({ actionId: ACTION_ATTACK, grade: 2 }, M2_RUN)).toBe('⚔️ 공격 고급');
    expect(formatCompositionEntry({ actionId: ACTION_SHIELD_BASH, grade: 1, count: 2 }, M2_RUN)).toBe('💥 방패 강타 일반 ×2');
    expect(formatReelTitle(0, 6)).toBe('릴 1 · 6개');
  });

  it('orders actions attack, guard, skill regardless of the data resolution order', () => {
    expect(ACTIONS.map((action) => action.id)).toEqual([ACTION_GUARD, ACTION_SHIELD_BASH, ACTION_ATTACK]);
    expect(displayActionIds(ACTIONS)).toEqual([ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH]);
  });

  it('formats probabilities as percent with one decimal', () => {
    expect(formatPercent(0.3296)).toBe('33.0%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });
});

describe('statRows: M2 spec section 9 examples (one spin per turn)', () => {
  it('example 1b (add A2 to reel 3): 2+/3+ rows only where non-zero, expected lines, the average grade that moved', () => {
    const rows = rowsOf({ kind: 'add', reelIndex: 2, symbol: { actionId: ACTION_ATTACK, grade: 2 } });
    expect(rows.map((row) => [row.label, row.before, row.after, row.delta])).toEqual([
      // Delta is the difference of the displayed values (33.0 -> 29.6 = -3.4), not of the exact ones (-3.34).
      ['빈 턴', '33.0%', '29.6%', '-3.4%p'],
      ['공격', '52.4%', '58.1%', '+5.7%p'],
      ['2줄 이상', '17.4%', '22.7%', '+5.3%p'],
      ['3줄 이상', '5.5%', '8.2%', '+2.7%p'],
      ['기대 줄 수', '0.78', '0.93', '+0.15'],
      ['평균 등급', '1.00', '1.10', '+0.10'],
      ['방어', '2.3%', '2.0%', '-0.3%p'],
      ['기대 줄 수', '0.02', '0.02', '±0'],
      ['방패 강타', '17.5%', '15.1%', '-2.4%p'],
      ['2줄 이상', '1.0%', '0.8%', '-0.2%p'],
      ['3줄 이상', '0.1%', '0.0%', '-0.1%p'],
      ['기대 줄 수', '0.19', '0.16', '-0.03'],
    ]);
    expect(rows.map((row) => row.secondary)).toEqual([
      false, false, true, true, true, true, false, true, false, true, true, true,
    ]);
  });

  it('example 2 (delete G1 from reel 2): guard becomes impossible and is flagged, not hidden', () => {
    const rows = rowsOf({ kind: 'delete', reelIndex: 1, symbolIndex: 3 });
    const guard = rows.find((row) => row.label === '방어');
    expect(guard).toEqual({
      label: '방어',
      before: '2.3%',
      after: '0.0%',
      delta: '-2.3%p',
      trend: 'down',
      secondary: false,
      impossible: true,
    });
    expect(rows.filter((row) => row.impossible)).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: '빈 턴', before: '33.0%', after: '25.6%', delta: '-7.4%p', trend: 'down' });
    expect(rows[1]).toMatchObject({ label: '공격', after: '60.2%', delta: '+7.8%p', trend: 'up' });
  });

  it('example 3 (enhance an S1 on reel 3): probabilities unchanged, only the skill average grade rises', () => {
    const rows = rowsOf({ kind: 'enhance', reelIndex: 2, symbolIndex: 4 });
    const fireRows = rows.filter((row) => row.label !== '평균 등급');
    expect(fireRows.every((row) => row.delta === '±0' && row.trend === 'same')).toBe(true);
    expect(rows.filter((row) => row.label === '평균 등급')).toEqual([
      { label: '평균 등급', before: '1.00', after: '1.17', delta: '+0.17', trend: 'up', secondary: true, impossible: false },
    ]);
  });
});

describe('statRows: M2.5 turn level (spec 7.2, 8.5)', () => {
  it('start reels AAAGGSS over the effective 3 spins match the spec 8.5 table', () => {
    const run = startRun(M25_RUN);
    const options = analysisOptions(run);
    expect(options.spins).toBe(3);
    // Enhancing leaves every probability unchanged, so before and after both show the unedited reels.
    const preview = previewEdit(run.state.reels, { kind: 'enhance', reelIndex: 0, symbolIndex: 0 }, options);
    const rows = statRows(preview, M25_RUN);
    expect(rows.filter((row) => row.label !== '평균 등급').map((row) => [row.label, row.before, row.delta])).toEqual([
      ['빈 턴', '9.0%', '±0'],
      ['공격', '74.4%', '±0'],
      ['2줄 이상', '40.7%', '±0'],
      ['3줄 이상', '18.0%', '±0'],
      ['기대 줄 수', '1.44', '±0'],
      ['방어', '30.0%', '±0'],
      ['2줄 이상', '4.5%', '±0'],
      ['3줄 이상', '0.5%', '±0'],
      ['기대 줄 수', '0.35', '±0'],
      ['방패 강타', '30.0%', '±0'],
      ['2줄 이상', '4.5%', '±0'],
      ['3줄 이상', '0.5%', '±0'],
      ['기대 줄 수', '0.35', '±0'],
    ]);
    const exact = analyzeReels(run.state.reels, options);
    expect(exact.empty).toBeCloseTo(0.0903, 4);
    expect(exact.actions[ACTION_GUARD]?.fire).toBeCloseTo(0.2997, 4);
  });

  it('states the turn basis with the spin count', () => {
    expect(formatTurnBasis(3)).toBe('발동 확률은 한 턴 기준입니다 (스핀 3회를 모두 돌려 합산).');
  });
});
