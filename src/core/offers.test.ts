import { describe, expect, it } from 'vitest';
import { RUN_RULES } from '../data';
import { scriptedRng } from '../test-support/test-helpers';
import { drawOffers, rewardCandidates } from './offers';
import { createRng } from './rng';
import type { ReelSymbol } from './types';

const key = (symbol: ReelSymbol) => `${symbol.actionId}${symbol.grade}`;
const DRAWS_PER_K = 2000;
const CLEARED_STEPS = [1, 2, 3, 4, 5];

describe('rewardCandidates', () => {
  it('k = 1: attack1, attack2, guard1, guard2, shield_bash1, shield_bash2 with weights summing to 10000', () => {
    const candidates = rewardCandidates(RUN_RULES, 1);
    expect(candidates.map((candidate) => [key(candidate.symbol), candidate.weight])).toEqual([
      ['attack1', 3200],
      ['attack2', 800],
      ['guard1', 2400],
      ['guard2', 600],
      ['shield_bash1', 2400],
      ['shield_bash2', 600],
    ]);
  });

  it('drops zero-weight grades; heroes (4) appear from k = 4', () => {
    const grades = (k: number) => [...new Set(rewardCandidates(RUN_RULES, k).map((c) => c.symbol.grade))];
    expect(CLEARED_STEPS.map(grades)).toEqual([[1, 2], [1, 2, 3], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4]]);
  });

  it('throws for a k without grade weights', () => {
    expect(() => rewardCandidates(RUN_RULES, 6)).toThrow(/no grade weights for 6/);
  });
});

describe('drawOffers', () => {
  it('M2 example 1a: rng [0, 0.5, 0.999] at k = 1 -> attack(1), guard(2), shield_bash(2) with exactly 3 calls', () => {
    const rng = scriptedRng([0, 0.5, 0.999]);
    expect(drawOffers(RUN_RULES, 1, rng)).toEqual([
      { actionId: 'attack', grade: 1 },
      { actionId: 'guard', grade: 2 },
      { actionId: 'shield_bash', grade: 2 },
    ]);
    expect(rng.calls()).toBe(3);
  });

  it('a value just below 1 picks the last remaining candidate each time', () => {
    const largestBelowOne = 1 - Number.EPSILON / 2;
    const offers = drawOffers(RUN_RULES, 1, scriptedRng([largestBelowOne, largestBelowOne, largestBelowOne]));
    expect(offers.map(key)).toEqual(['shield_bash2', 'shield_bash1', 'guard2']);
  });

  it('never repeats an (action, grade) pair and only offers positive-weight candidates, for every k', () => {
    const rng = createRng(2026);
    for (const k of CLEARED_STEPS) {
      const allowed = new Set(rewardCandidates(RUN_RULES, k).map((candidate) => key(candidate.symbol)));
      for (let draw = 0; draw < DRAWS_PER_K; draw++) {
        const keys = drawOffers(RUN_RULES, k, rng).map(key);
        expect(keys).toHaveLength(RUN_RULES.offerCount);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.every((offer) => allowed.has(offer))).toBe(true);
      }
    }
  });

  it('is reproducible from the seed', () => {
    expect(drawOffers(RUN_RULES, 4, createRng(9))).toEqual(drawOffers(RUN_RULES, 4, createRng(9)));
  });

  it('rejects rng values outside [0, 1) and too few candidates', () => {
    expect(() => drawOffers(RUN_RULES, 1, scriptedRng([1]))).toThrow(/expected a value in \[0, 1\)/);
    const tiny = { ...RUN_RULES, offerCount: 7 };
    expect(() => drawOffers(tiny, 1, createRng(1))).toThrow(/6 candidates cannot fill 7 offers/);
  });
});
