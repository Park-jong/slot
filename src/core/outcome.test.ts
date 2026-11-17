import { describe, expect, it } from 'vitest';
import { ACTIONS, GRADES, STANDARD_TIERS } from '../data';
import { evaluateOutcomes } from './battle';
import { judge } from './judge';
import { activeEffects, evaluateAction, power, selectTier } from './outcome';
import { boardFromRows } from './test-helpers';
import type { ActionDef } from './types';

function action(id: string): ActionDef {
  const found = ACTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing action ${id}`);
  return found;
}

const outcomesFor = (rows: string[]) => evaluateOutcomes(judge(boardFromRows(rows), GRADES), ACTIONS);

describe('power and tiers', () => {
  it('selects the tier by line count and caps at the top tier', () => {
    expect([1, 2, 3, 4, 5, 8].map((n) => selectTier(STANDARD_TIERS, n).multiplierNum)).toEqual([2, 3, 4, 6, 6, 6]);
    expect(() => selectTier(STANDARD_TIERS, 0)).toThrow();
  });

  it('selects the max lineCount <= n even when tiers are not sorted', () => {
    const unsorted = [
      { lineCount: 3, multiplierNum: 4 },
      { lineCount: 1, multiplierNum: 2 },
      { lineCount: 4, multiplierNum: 6 },
      { lineCount: 2, multiplierNum: 3 },
    ];
    expect([1, 2, 3, 4, 5, 8].map((n) => selectTier(unsorted, n).multiplierNum)).toEqual([2, 3, 4, 6, 6, 6]);
    expect(() => selectTier(unsorted, 0)).toThrow();
  });

  it('example 4: power function alone', () => {
    const shieldBash = evaluateAction(action('shield_bash'), { lineCount: 2, gradeSumTotal: 7 });
    expect([shieldBash.damage, shieldBash.guard]).toEqual([10, 10]);
    expect(evaluateAction(action('attack'), { lineCount: 3, gradeSumTotal: 10 }).damage).toBe(40);
    expect(evaluateAction(action('attack'), { lineCount: 8, gradeSumTotal: 24 })).toMatchObject({
      damage: 144,
      ignoreGuard: true,
      multiplierNum: 6,
    });
  });

  it('applies floor once to the total, not per line', () => {
    const [shieldBash] = outcomesFor(['S1 S1 S1', 'A1 G1 A1', 'S1 S1 S1']);
    expect(shieldBash).toMatchObject({ actionId: 'shield_bash', lineCount: 2, gradeSumTotal: 6, damage: 9, guard: 9 });
    const perLineFloored = power(1, 3, 3) + power(1, 3, 3);
    expect(perLineFloored).toBe(8);
  });
});

describe('effects', () => {
  it('ignore_guard needs 2+ attack lines; deferred effects are never active', () => {
    expect(activeEffects(action('attack'), 1)).toEqual([]);
    expect(activeEffects(action('attack'), 4).map((effect) => effect.id)).toEqual(['ignore_guard']);
    expect(activeEffects(action('guard'), 4)).toEqual([]);
    expect(activeEffects(action('shield_bash'), 3)).toEqual([]);
  });
});

describe('outcomes from spec boards', () => {
  it('example 1: attack 10, no guard', () => {
    expect(outcomesFor(['A1 A3 A1', 'G1 S1 G1', 'S1 G1 S1'])).toEqual([
      { actionId: 'attack', lineCount: 1, gradeSumTotal: 5, multiplierNum: 2, damage: 10, guard: 0, ignoreGuard: false },
    ]);
  });

  it('example 2: guard 8, attack 27 ignoring guard', () => {
    const [guard, attack] = outcomesFor(['A1 A1 G1', 'A2 A1 G1', 'A1 A3 G2']);
    expect(guard).toMatchObject({ actionId: 'guard', guard: 8, damage: 0 });
    expect(attack).toMatchObject({ actionId: 'attack', damage: 27, ignoreGuard: true });
  });

  it('example 3: resolution order guard -> shield_bash -> attack with values 8, 4/4, 6', () => {
    const outcomes = outcomesFor(['G1 S1 A1', 'G1 S2 A1', 'G2 S1 A1']);
    expect(outcomes.map((o) => [o.actionId, o.damage, o.guard])).toEqual([
      ['guard', 0, 8],
      ['shield_bash', 4, 4],
      ['attack', 6, 0],
    ]);
  });
});
