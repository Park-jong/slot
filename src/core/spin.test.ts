import { describe, expect, it } from 'vitest';
import { APPRENTICE_KNIGHT } from '../data';
import { createRng, type Rng } from './rng';
import { spin } from './spin';
import type { Reel, ReelSymbol } from './types';

const DISTINCT_REEL: Reel = Array.from({ length: 6 }, (_, index) => ({ actionId: `s${index}`, grade: 1 }));
const DISTINCT_REELS = [DISTINCT_REEL, DISTINCT_REEL, DISTINCT_REEL];

function scriptedRng(values: readonly number[]): Rng & { calls: () => number } {
  let index = 0;
  const rng = () => {
    const value = values[index++];
    if (value === undefined) throw new Error('scripted rng exhausted');
    return value;
  };
  return Object.assign(rng, { calls: () => index });
}

const ids = (column: readonly ReelSymbol[] | undefined) => column?.map((symbol) => symbol.actionId);

describe('spin', () => {
  it('draws reel 0, 1, 2 in order with exactly 9 rng calls, without replacement', () => {
    const rng = scriptedRng([0, 0, 0, 0.99, 0.99, 0.99, 0.5, 0.5, 0.5]);
    const board = spin(DISTINCT_REELS, rng);
    expect(rng.calls()).toBe(9);
    expect(ids(board[0])).toEqual(['s0', 's1', 's2']);
    expect(ids(board[1])).toEqual(['s5', 's4', 's3']);
    expect(ids(board[2])).toEqual(['s3', 's2', 's4']);
  });

  it('is reproducible with the same seed', () => {
    const reels = APPRENTICE_KNIGHT.startingReels;
    expect(spin(reels, createRng(42))).toEqual(spin(reels, createRng(42)));
    expect(spin(DISTINCT_REELS, createRng(7))).toEqual(spin(DISTINCT_REELS, createRng(7)));
  });

  it('does not mutate the reels', () => {
    const reels = [[...DISTINCT_REEL], [...DISTINCT_REEL], [...DISTINCT_REEL]];
    const snapshot = structuredClone(reels);
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) spin(reels, rng);
    expect(reels).toEqual(snapshot);
  });

  it('never draws the same reel index twice in one column', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 2000; i++) {
      for (const column of spin(DISTINCT_REELS, rng)) {
        expect(new Set(column).size).toBe(column.length);
      }
    }
  });

  it('rejects reels with fewer than 3 symbols and boards without 3 reels', () => {
    const short = DISTINCT_REEL.slice(0, 2);
    expect(() => spin([DISTINCT_REEL, short, DISTINCT_REEL], createRng(1))).toThrow(/at least 3/);
    expect(() => spin([DISTINCT_REEL, DISTINCT_REEL], createRng(1))).toThrow(/expected 3 reels/);
  });

  it.each([-0.1, -Number.MIN_VALUE, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws when rng returns %s (outside [0, 1))',
    (bad) => {
      expect(() => spin(DISTINCT_REELS, scriptedRng([0.5, bad]))).toThrow(/expected a value in \[0, 1\)/);
    },
  );

  it('accepts the boundary values 0 and the largest double below 1', () => {
    const largestBelowOne = 1 - Number.EPSILON / 2;
    const rng = scriptedRng(Array.from({ length: 9 }, (_, index) => (index % 2 === 0 ? 0 : largestBelowOne)));
    expect(() => spin(DISTINCT_REELS, rng)).not.toThrow();
  });
});
