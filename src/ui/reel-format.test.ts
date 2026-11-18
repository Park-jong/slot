import { describe, expect, it } from 'vitest';
import { previewEdit } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, ACTIONS, M2_RUN } from '../data';
import { analysisOptions } from './edit-candidates';
import {
  displayActionIds,
  formatCompositionEntry,
  formatPercent,
  formatReelTitle,
  formatSymbol,
  statRows,
  type StatRow,
} from './reel-format';

const START_REELS = M2_RUN.character.startingReels;
const OPTIONS = analysisOptions(M2_RUN);

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

describe('statRows: M2 spec section 9 examples', () => {
  it('example 1b (add A2 to reel 3): fire rows, 2+ rows only where non-zero, the average grade that moved', () => {
    const rows = rowsOf({ kind: 'add', reelIndex: 2, symbol: { actionId: ACTION_ATTACK, grade: 2 } });
    expect(rows.map((row) => [row.label, row.before, row.after, row.delta])).toEqual([
      // Delta is the difference of the displayed values (33.0 -> 29.6 = -3.4), not of the exact ones (-3.34).
      ['빈 턴', '33.0%', '29.6%', '-3.4%p'],
      ['공격', '52.4%', '58.1%', '+5.7%p'],
      ['2라인 이상', '17.4%', '22.7%', '+5.3%p'],
      ['평균 등급', '1.00', '1.10', '+0.10'],
      ['방어', '2.3%', '2.0%', '-0.3%p'],
      ['방패 강타', '17.5%', '15.1%', '-2.4%p'],
      ['2라인 이상', '1.0%', '0.8%', '-0.2%p'],
    ]);
    expect(rows.map((row) => row.secondary)).toEqual([false, false, true, true, false, false, true]);
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
