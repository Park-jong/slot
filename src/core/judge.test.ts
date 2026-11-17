import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRADES } from '../data';
import { judge } from './judge';
import { boardFromRows, EMPTY_BOARD } from './test-helpers';

const EXAMPLE_1 = boardFromRows(['A1 A3 A1', 'G1 S1 G1', 'S1 G1 S1']);
const EXAMPLE_2 = boardFromRows(['A1 A1 G1', 'A2 A1 G1', 'A1 A3 G2']);
const EXAMPLE_3 = boardFromRows(['G1 S1 A1', 'G1 S2 A1', 'G2 S1 A1']);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('judge', () => {
  it('maps spec rows to board[reel][row]', () => {
    expect(EXAMPLE_1[1]?.map((s) => `${s.actionId}${s.grade}`)).toEqual(['attack3', 'shield_bash1', 'guard1']);
  });

  it('example 1: only H1 fires, grades are ignored for matching', () => {
    const result = judge(EXAMPLE_1, GRADES);
    expect(result.firedLines.map((line) => [line.lineId, line.actionId, line.gradeSum])).toEqual([['H1', 'attack', 5]]);
    expect(result.byAction).toEqual({ attack: { lineCount: 1, gradeSumTotal: 5, lineIds: ['H1'] } });
  });

  it('example 2: two attack verticals and one guard vertical', () => {
    const result = judge(EXAMPLE_2, GRADES);
    expect(result.firedLines.map((line) => [line.lineId, line.gradeSum])).toEqual([
      ['V1', 4],
      ['V2', 5],
      ['V3', 4],
    ]);
    expect(result.byAction).toEqual({
      attack: { lineCount: 2, gradeSumTotal: 9, lineIds: ['V1', 'V2'] },
      guard: { lineCount: 1, gradeSumTotal: 4, lineIds: ['V3'] },
    });
  });

  it('example 3: one vertical per action', () => {
    expect(judge(EXAMPLE_3, GRADES).byAction).toEqual({
      guard: { lineCount: 1, gradeSumTotal: 4, lineIds: ['V1'] },
      shield_bash: { lineCount: 1, gradeSumTotal: 4, lineIds: ['V2'] },
      attack: { lineCount: 1, gradeSumTotal: 3, lineIds: ['V3'] },
    });
  });

  it('reports fired line cells for highlighting', () => {
    const [line] = judge(EXAMPLE_1, GRADES).firedLines;
    expect(line?.cells).toEqual([
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
    ]);
  });

  it('fires all 8 lines on a uniform board', () => {
    const result = judge(boardFromRows(['A1 A1 A1', 'A1 A1 A1', 'A1 A1 A1']), GRADES);
    expect(result.firedLines.map((line) => line.lineId)).toEqual(['H1', 'H2', 'H3', 'V1', 'V2', 'V3', 'D1', 'D2']);
    expect(result.byAction['attack']).toMatchObject({ lineCount: 8, gradeSumTotal: 24 });
  });

  it('returns nothing for a board without lines', () => {
    expect(judge(EMPTY_BOARD, GRADES)).toEqual({ firedLines: [], byAction: {} });
  });

  it('is deterministic and uses no randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('judge must not use randomness');
    });
    expect(judge(EXAMPLE_2, GRADES)).toEqual(judge(EXAMPLE_2, GRADES));
    expect(random).not.toHaveBeenCalled();
    expect(judge.length).toBe(2);
  });

  it('throws on an unknown grade', () => {
    expect(() => judge(boardFromRows(['A9 A1 A1', 'G1 G1 A1', 'A1 A1 G1']), GRADES)).toThrow(/unknown grade 9/);
  });
});
