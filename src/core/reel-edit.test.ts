import { describe, expect, it } from 'vitest';
import { GRADES, RUN_RULES } from '../data';
import { reelFromNotation } from '../test-support/test-helpers';
import { appendSymbol, deleteSymbolAt, enhanceSymbolAt, nextGrade } from './reel-edit';

const START = reelFromNotation('A1 A1 A1 G1 S1 S1');
const REELS = [START, START, START];

describe('reel edits never mutate their input', () => {
  it('append, delete and enhance return new reels and leave the old ones intact', () => {
    const snapshot = structuredClone(REELS);
    appendSymbol(REELS, 0, { actionId: 'attack', grade: 2 }, RUN_RULES);
    deleteSymbolAt(REELS, 1, 0, RUN_RULES);
    const enhanced = enhanceSymbolAt(REELS, 2, 0, GRADES);
    expect(REELS).toEqual(snapshot);
    expect(enhanced[0]).toBe(REELS[0]);
  });

  it('enhancing one of several identical symbols changes only that index', () => {
    const enhanced = enhanceSymbolAt(REELS, 0, 1, GRADES);
    expect(enhanced[0]).toEqual(reelFromNotation('A1 A2 A1 G1 S1 S1'));
  });
});

describe('nextGrade', () => {
  it('steps 1 -> 2 -> 3 -> 4 and stops at the hero grade', () => {
    expect([1, 2, 3, 4].map((grade) => nextGrade(GRADES, grade))).toEqual([2, 3, 4, undefined]);
  });

  it('skips a missing grade id in a gapped table (1, 2, 4)', () => {
    const { 3: _missing, ...gapped } = GRADES;
    expect([1, 2, 4].map((grade) => nextGrade(gapped, grade))).toEqual([2, 4, undefined]);
  });
});
