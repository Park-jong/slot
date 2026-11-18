// M2.5 spec 5.1 / example 11: effective max spins, Focus per unused spin and the damage modifier.
import { describe, expect, it } from 'vitest';
import { TURN_RULES } from '../data';
import { resolveTurnStats } from './turn-stats';
import type { TurnModifier } from './types';

const modifier = (fields: Omit<TurnModifier, 'id'>): TurnModifier => ({ id: 'test_item', ...fields });

describe('resolveTurnStats: spec 5.1 clamp table (base, add, mulPct -> max), bounds [1, 5]', () => {
  const rows: readonly (readonly [number, number, number, number])[] = [
    [3, 0, 100, 3],
    [3, 3, 100, 5],
    [3, -1, 100, 2],
    [3, -5, 100, 1],
    [3, 0, 150, 4],
    [3, 1, 150, 5],
    [3, -1, 50, 1],
    [3, 2, 100, 5],
    [4, 0, 100, 4],
    [1, 0, 200, 2],
  ];

  it.each(rows)('base %i, add %i, mulPct %i -> %i', (base, add, mulPct, expected) => {
    const stats = resolveTurnStats(base, TURN_RULES, [modifier({ spinsPerTurnAdd: add, spinsPerTurnMulPct: mulPct })]);
    expect(stats.maxSpins).toBe(expected);
  });

  it('no modifiers: max = clamp(base), Focus 50, damagePct 0', () => {
    expect(resolveTurnStats(3, TURN_RULES, [])).toEqual({ maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 });
    expect(resolveTurnStats(9, TURN_RULES, []).maxSpins).toBe(5);
  });
});

describe('resolveTurnStats: modifier sums and products', () => {
  it('the three example items of spec 5.2', () => {
    expect(resolveTurnStats(3, TURN_RULES, [modifier({ spinsPerTurnAdd: 1 })])).toEqual({ maxSpins: 4, focusPctPerUnused: 50, damagePct: 0 });
    expect(resolveTurnStats(3, TURN_RULES, [modifier({ spinsPerTurnAdd: -1, damagePct: 130 })])).toEqual({
      maxSpins: 2,
      focusPctPerUnused: 50,
      damagePct: 130,
    });
    expect(resolveTurnStats(3, TURN_RULES, [modifier({ focusPctAdd: 25 })])).toEqual({ maxSpins: 3, focusPctPerUnused: 75, damagePct: 0 });
  });

  it('adds sum, damage percents sum, and percents multiply with a floor at each step (12.12: 105% x 105% -> 110%)', () => {
    const stats = resolveTurnStats(10, { ...TURN_RULES, spinsPerTurnHardCap: 20 }, [
      modifier({ spinsPerTurnAdd: 1, spinsPerTurnMulPct: 105, damagePct: 20 }),
      modifier({ spinsPerTurnAdd: -1, spinsPerTurnMulPct: 105, damagePct: -5 }),
    ]);
    // acc = floor(100 x 105 / 100) = 105, then floor(105 x 105 / 100) = 110; max = floor(10 x 110 / 100) = 11.
    expect(stats).toEqual({ maxSpins: 11, focusPctPerUnused: 50, damagePct: 15 });
  });

  it('a negative Focus total is clamped to 0', () => {
    expect(resolveTurnStats(3, TURN_RULES, [modifier({ focusPctAdd: -80 })]).focusPctPerUnused).toBe(0);
  });

  it('mulPct 0 drops to the minimum, not 0 spins', () => {
    expect(resolveTurnStats(3, TURN_RULES, [modifier({ spinsPerTurnMulPct: 0 })]).maxSpins).toBe(1);
  });
});

describe('resolveTurnStats: integer validation (AC-5.7)', () => {
  it.each([
    ['spinsPerTurnAdd', { spinsPerTurnAdd: 0.5 }],
    ['spinsPerTurnMulPct', { spinsPerTurnMulPct: 150.5 }],
    ['damagePct', { damagePct: 1.5 }],
    ['focusPctAdd', { focusPctAdd: Number.NaN }],
  ] as const)('non-integer %s throws', (field, fields) => {
    expect(() => resolveTurnStats(3, TURN_RULES, [modifier(fields)])).toThrow(new RegExp(field));
  });

  it('negative spinsPerTurnMulPct throws', () => {
    expect(() => resolveTurnStats(3, TURN_RULES, [modifier({ spinsPerTurnMulPct: -10 })])).toThrow(/spinsPerTurnMulPct/);
  });

  it('bad rules and a non-integer base throw', () => {
    expect(() => resolveTurnStats(2.5, TURN_RULES, [])).toThrow(/base spinsPerTurn/);
    expect(() => resolveTurnStats(3, { ...TURN_RULES, spinsPerTurnMin: 0 }, [])).toThrow(/spinsPerTurnMin/);
    expect(() => resolveTurnStats(3, { ...TURN_RULES, spinsPerTurnMin: 3, spinsPerTurnHardCap: 2 }, [])).toThrow(/HardCap/);
    expect(() => resolveTurnStats(3, { ...TURN_RULES, focusPercentPerUnusedSpin: -1 }, [])).toThrow(/focusPercentPerUnusedSpin/);
    expect(() => resolveTurnStats(3, { ...TURN_RULES, focusPercentPerUnusedSpin: 12.5 }, [])).toThrow(/focusPercentPerUnusedSpin/);
  });
});
