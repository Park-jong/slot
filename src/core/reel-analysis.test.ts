import { describe, expect, it } from 'vitest';
import { analyzeReels, previewEdit, reelComposition, type AnalyzeOptions, type ReelAnalysis } from './reel-analysis';
import { canEnhanceAt } from './reel-edit';
import type { GradeTable, Reel, ReelSymbol } from './types';

// Inline fixtures so these tests do not depend on src/data contents.
const ATTACK = 'attack';
const GUARD = 'guard';
const SKILL = 'shield_bash';
const NOTATION: Readonly<Record<string, string>> = { A: ATTACK, G: GUARD, S: SKILL };

/** Spec notation, e.g. "A1 A1 A1 G1 S1 S1". */
function reel(notation: string): Reel {
  return notation.split(/\s+/).map((token): ReelSymbol => {
    const actionId = NOTATION[token.charAt(0)];
    if (!actionId) throw new Error(`bad token ${token}`);
    return { actionId, grade: Number(token.slice(1)) };
  });
}

/** Grades 1..4 whose value equals the id, like the M1/M2 table. */
const GRADES: GradeTable = {
  1: { id: 1, name: 'g1', value: 1 },
  2: { id: 2, name: 'g2', value: 2 },
  3: { id: 3, name: 'g3', value: 3 },
  4: { id: 4, name: 'g4', value: 4 },
};
const OPTIONS: AnalyzeOptions = { grades: GRADES };

const M2_START = reel('A1 A1 A1 G1 S1 S1');
const M1_START = reel('A1 A1 A1 G1 G1 S1');
const M2_REELS = [M2_START, M2_START, M2_START];
const M1_REELS = [M1_START, M1_START, M1_START];
const MIXED_REELS = [
  reel('A1 A1 A1 A1 A1 G1 G1 G1 G1 S1 S1 S1'),
  reel('A1 A1 A1 A1 G1 G1 G1 G1 S1 S1 S1 S1'),
  reel('G1 A1 S1 A1 G1 S1 A1'),
];

/** Spec percentage tables are rounded to 0.01 percentage points. */
const PERCENT_POINT_TOLERANCE = 0.0001;
const EXACT_TOLERANCE = 1e-9;

interface PercentRow {
  readonly empty: number;
  readonly attack: readonly [number, number];
  readonly guard: readonly [number, number];
  readonly skill: readonly [number, number];
}

function expectPercentRow(result: ReelAnalysis, row: PercentRow): void {
  const near = (actual: number | undefined, percent: number): void => {
    expect(Math.abs((actual ?? Number.NaN) - percent / 100)).toBeLessThanOrEqual(PERCENT_POINT_TOLERANCE);
  };
  near(result.empty, row.empty);
  const pairs: ReadonlyArray<readonly [string, readonly [number, number]]> = [
    [ATTACK, row.attack],
    [GUARD, row.guard],
    [SKILL, row.skill],
  ];
  for (const [actionId, [fire, fire2plus]] of pairs) {
    near(result.actions[actionId]?.fire, fire);
    near(result.actions[actionId]?.fire2plus, fire2plus);
  }
}

describe('analyzeReels: spec section 5 table', () => {
  it('M2 start reel AAAGSS x3', () => {
    expectPercentRow(analyzeReels(M2_REELS, OPTIONS), {
      empty: 32.96,
      attack: [52.4, 17.37],
      guard: [2.31, 0],
      skill: [17.45, 1.01],
    });
  });

  it('M1 start reel AAAGGS x3', () => {
    expectPercentRow(analyzeReels(M1_REELS, OPTIONS), {
      empty: 32.96,
      attack: [52.4, 17.37],
      guard: [17.45, 1.01],
      skill: [2.31, 0],
    });
  });

  it('reports reel sizes and every action present, in first-appearance order', () => {
    const result = analyzeReels(M2_REELS, OPTIONS);
    expect(result.reelSizes).toEqual([6, 6, 6]);
    expect(Object.keys(result.actions)).toEqual([ATTACK, GUARD, SKILL]);
  });
});

describe('previewEdit: spec section 9 examples', () => {
  const M2_BEFORE: PercentRow = { empty: 32.96, attack: [52.4, 17.37], guard: [2.31, 0], skill: [17.45, 1.01] };

  it('example 1b: add attack(2) to reel 2', () => {
    const { before, after } = previewEdit(M2_REELS, { kind: 'add', reelIndex: 2, symbol: { actionId: ATTACK, grade: 2 } }, OPTIONS);
    expectPercentRow(before, M2_BEFORE);
    expectPercentRow(after, { empty: 29.62, attack: [58.12, 22.72], guard: [1.98, 0], skill: [15.07, 0.76] });
    expect(after.reelSizes).toEqual([6, 6, 7]);
    // 9 x A1 + 1 x A2 over all reels.
    expect(after.actions[ATTACK]?.avgGradeValue).toBeCloseTo(11 / 10, 12);
  });

  it('example 2: delete G1 (index 3) from reel 1 makes guard impossible', () => {
    const { before, after } = previewEdit(M2_REELS, { kind: 'delete', reelIndex: 1, symbolIndex: 3 }, OPTIONS);
    expectPercentRow(before, M2_BEFORE);
    expectPercentRow(after, { empty: 25.59, attack: [60.17, 23.18], guard: [0, 0], skill: [20.76, 1.38] });
    expect(after.reelSizes).toEqual([6, 5, 6]);
    expect(after.actions[GUARD]).toEqual({ fire: 0, fire2plus: 0, expectedLines: 0, avgGradeValue: 1 });
  });

  it('example 3: enhance S1 (index 4) on reel 2 changes only avgGradeValue', () => {
    const { before, after } = previewEdit(M2_REELS, { kind: 'enhance', reelIndex: 2, symbolIndex: 4 }, OPTIONS);
    expect(Math.abs(after.empty - before.empty)).toBeLessThanOrEqual(EXACT_TOLERANCE);
    for (const actionId of [ATTACK, GUARD, SKILL]) {
      const b = before.actions[actionId];
      const a = after.actions[actionId];
      expect(Math.abs((a?.fire ?? 0) - (b?.fire ?? 0))).toBeLessThanOrEqual(EXACT_TOLERANCE);
      expect(Math.abs((a?.fire2plus ?? 0) - (b?.fire2plus ?? 0))).toBeLessThanOrEqual(EXACT_TOLERANCE);
      expect(Math.abs((a?.expectedLines ?? 0) - (b?.expectedLines ?? 0))).toBeLessThanOrEqual(EXACT_TOLERANCE);
    }
    expectPercentRow(after, M2_BEFORE);
    expect(before.actions[SKILL]?.avgGradeValue).toBe(1);
    expect(Math.abs((after.actions[SKILL]?.avgGradeValue ?? 0) - 7 / 6)).toBeLessThanOrEqual(EXACT_TOLERANCE);
    expect(after.actions[ATTACK]?.avgGradeValue).toBe(1);
  });
});

describe('analyzeReels: cross-check with tools/sim/reel-stats.mjs', () => {
  // Printed by `node tools/sim/reel-stats.mjs` (2026-11-17), percentages with 2 decimals.
  it('matches the printed worked examples', () => {
    expectPercentRow(analyzeReels(M1_REELS, OPTIONS), { empty: 32.96, attack: [52.4, 17.37], guard: [17.45, 1.01], skill: [2.31, 0] });
    expectPercentRow(analyzeReels([M2_START, M2_START, reel('A1 A1 A1 G1 S1 S1 A2')], OPTIONS), {
      empty: 29.62,
      attack: [58.12, 22.72],
      guard: [1.98, 0],
      skill: [15.07, 0.76],
    });
    expectPercentRow(analyzeReels([M2_START, reel('A1 A1 A1 S1 S1'), M2_START], OPTIONS), {
      empty: 25.59,
      attack: [60.17, 23.18],
      guard: [0, 0],
      skill: [20.76, 1.38],
    });
    expectPercentRow(analyzeReels([M2_START, M2_START, reel('A1 A1 A1 G1 S2 S1')], OPTIONS), {
      empty: 32.96,
      attack: [52.4, 17.37],
      guard: [2.31, 0],
      skill: [17.45, 1.01],
    });
  });

  // Full precision from the reference `analyzeReels` (fields empty / fire / fire2 / expLines) on the same inputs.
  const REFERENCE: ReadonlyArray<{
    readonly name: string;
    readonly reels: readonly Reel[];
    readonly empty: number;
    readonly actions: Readonly<Record<string, readonly [number, number, number]>>;
  }> = [
    {
      name: 'M2 start',
      reels: M2_REELS,
      empty: 0.3295972222222068,
      actions: {
        attack: [0.5239999999999798, 0.17374999999999863, 0.7749999999999891],
        guard: [0.023148148148148126, 0, 0.023148148148148126],
        shield_bash: [0.1745185185185155, 0.0100740740740741, 0.18518518518518176],
      },
    },
    {
      name: 'example 1b after',
      reels: [M2_START, M2_START, reel('A1 A1 A1 G1 S1 S1 A2')],
      empty: 0.2962328042328062,
      actions: {
        attack: [0.5812142857142941, 0.22721428571428512, 0.9285714285714496],
        guard: [0.019841269841269802, 0, 0.019841269841269802],
        shield_bash: [0.15068783068782957, 0.0076190476190476294, 0.15873015873015772],
      },
    },
    {
      name: 'mixed 12/12/7',
      reels: MIXED_REELS,
      empty: 0.44036993309723615,
      actions: {
        attack: [0.2988797061524391, 0.06807031352485897, 0.38982683982684724],
        guard: [0.16918798373343966, 0.02180243998425814, 0.1950937950937957],
        shield_bash: [0.1277685950413217, 0.012239275875639447, 0.14177489177489228],
      },
    },
  ];

  it.each(REFERENCE)('$name matches the reference to 1e-9', ({ reels, empty, actions }) => {
    const result = analyzeReels(reels, OPTIONS);
    expect(Math.abs(result.empty - empty)).toBeLessThanOrEqual(EXACT_TOLERANCE);
    for (const [actionId, [fire, fire2plus, expectedLines]] of Object.entries(actions)) {
      const actual = result.actions[actionId];
      expect(Math.abs((actual?.fire ?? Number.NaN) - fire)).toBeLessThanOrEqual(EXACT_TOLERANCE);
      expect(Math.abs((actual?.fire2plus ?? Number.NaN) - fire2plus)).toBeLessThanOrEqual(EXACT_TOLERANCE);
      expect(Math.abs((actual?.expectedLines ?? Number.NaN) - expectedLines)).toBeLessThanOrEqual(EXACT_TOLERANCE);
    }
  });
});

describe('analyzeReels: invariants', () => {
  const CASES: ReadonlyArray<readonly [string, readonly Reel[]]> = [
    ['M1', M1_REELS],
    ['M2', M2_REELS],
    ['mixed', MIXED_REELS],
    ['minimal', [reel('A1 A1 A1'), reel('A1 G1 S1'), reel('S1 S1 S1')]],
  ];
  const LINE_COUNT = 8;

  it.each(CASES)('%s: probability bounds and orderings hold', (_, reels) => {
    const result = analyzeReels(reels, OPTIONS);
    const actions = Object.values(result.actions);
    const pAnyLine = 1 - result.empty;
    const fires = actions.map((action) => action.fire);
    expect(result.empty).toBeGreaterThanOrEqual(0);
    expect(result.empty).toBeLessThanOrEqual(1);
    // P(some line) lies between the largest single-action fire and the union bound.
    expect(Math.max(...fires)).toBeLessThanOrEqual(pAnyLine + EXACT_TOLERANCE);
    expect(pAnyLine).toBeLessThanOrEqual(fires.reduce((sum, fire) => sum + fire, 0) + EXACT_TOLERANCE);
    for (const action of actions) {
      expect(action.fire2plus).toBeLessThanOrEqual(action.fire + EXACT_TOLERANCE);
      expect(action.expectedLines).toBeGreaterThanOrEqual(action.fire - EXACT_TOLERANCE);
    }
    expect(actions.reduce((sum, action) => sum + action.expectedLines, 0)).toBeLessThanOrEqual(LINE_COUNT);
    expect(result.reelSizes).toEqual(reels.map((r) => r.length));
  });

  it('expected lines equal the sum of per-line probabilities (linearity, independent formula)', () => {
    const result = analyzeReels(MIXED_REELS, OPTIONS);
    for (const actionId of [ATTACK, GUARD, SKILL]) {
      const counts = MIXED_REELS.map((r) => r.filter((symbol) => symbol.actionId === actionId).length);
      const sizes = MIXED_REELS.map((r) => r.length);
      const share = counts.map((count, i) => count / (sizes[i] ?? 1));
      const crossReel = (share[0] ?? 0) * (share[1] ?? 0) * (share[2] ?? 0);
      const sameReel = counts.map((c, i) => {
        const n = sizes[i] ?? 0;
        return (c * (c - 1) * (c - 2)) / (n * (n - 1) * (n - 2));
      });
      // 3 horizontals + 2 diagonals take one cell per reel; 3 verticals take three cells of one reel.
      const expected = 5 * crossReel + sameReel.reduce((sum, p) => sum + p, 0);
      expect(Math.abs((result.actions[actionId]?.expectedLines ?? 0) - expected)).toBeLessThanOrEqual(EXACT_TOLERANCE);
    }
  });

  it('M2 start: guard can never fire two lines (one guard per reel), exactly 0', () => {
    expect(analyzeReels(M2_REELS, OPTIONS).actions[GUARD]?.fire2plus).toBe(0);
  });

  it('fire is exactly 0 when one reel lacks the action and the others hold fewer than 3', () => {
    const result = analyzeReels([reel('A1 A1 A1 G1 G1'), reel('A1 A1 A1 G1 G1'), reel('A1 A1 A1 S1')], OPTIONS);
    expect(result.actions[GUARD]?.fire).toBe(0);
    expect(result.actions[SKILL]?.fire).toBe(0);
  });

  it('all symbols of one action: every line fires', () => {
    const result = analyzeReels([reel('A1 A2 A3'), reel('A1 A1 A1'), reel('A4 A1 A1 A1')], OPTIONS);
    expect(result.empty).toBe(0);
    expect(result.actions[ATTACK]).toEqual({ fire: 1, fire2plus: 1, expectedLines: 8, avgGradeValue: 16 / 10 });
  });
});

describe('analyzeReels: options', () => {
  it('actionIds adds absent actions with zero values, listed first', () => {
    const result = analyzeReels([reel('A1 A1 S1'), reel('A1 A1 S1'), reel('A1 A1 S1')], { ...OPTIONS, actionIds: [GUARD, ATTACK] });
    expect(Object.keys(result.actions)).toEqual([GUARD, ATTACK, SKILL]);
    expect(result.actions[GUARD]).toEqual({ fire: 0, fire2plus: 0, expectedLines: 0, avgGradeValue: 0 });
  });

  it('grades table supplies avgGradeValue; unknown grade throws', () => {
    const grades: GradeTable = {
      1: { id: 1, name: 'g1', value: 10 },
      2: { id: 2, name: 'g2', value: 25 },
    };
    const reels = [reel('A1 A2 S1'), M2_START, M2_START];
    expect(analyzeReels(reels, { grades }).actions[ATTACK]?.avgGradeValue).toBeCloseTo((7 * 10 + 25) / 8, 12);
    expect(() => analyzeReels([reel('A3 A1 A1'), M2_START, M2_START], { grades })).toThrow(/unknown grade 3/);
  });

  it('rejects a wrong reel count or a reel shorter than the grid', () => {
    expect(() => analyzeReels([M2_START, M2_START], OPTIONS)).toThrow(/expected 3 reels/);
    expect(() => analyzeReels([M2_START, reel('A1 G1'), M2_START], OPTIONS)).toThrow(/reel 1 has 2 symbols/);
  });
});

describe('reelComposition', () => {
  it('counts the M2 start reel', () => {
    expect(reelComposition(M2_START)).toEqual([
      { actionId: ATTACK, grade: 1, count: 3 },
      { actionId: GUARD, grade: 1, count: 1 },
      { actionId: SKILL, grade: 1, count: 2 },
    ]);
  });

  it('orders actions by first appearance and grades ascending within an action', () => {
    expect(reelComposition(reel('S2 A3 S1 A1 S2 A1 G4'))).toEqual([
      { actionId: SKILL, grade: 1, count: 1 },
      { actionId: SKILL, grade: 2, count: 2 },
      { actionId: ATTACK, grade: 1, count: 2 },
      { actionId: ATTACK, grade: 3, count: 1 },
      { actionId: GUARD, grade: 4, count: 1 },
    ]);
  });

  it('returns an empty list for an empty reel', () => {
    expect(reelComposition([])).toEqual([]);
  });
});

describe('previewEdit: validation and purity', () => {
  it('does not mutate the input reels', () => {
    const reels = [reel('A1 A1 A1 G1 S1 S1'), reel('A1 A1 A1 G1 S1 S1'), reel('A1 A1 A1 G1 S1 S1')];
    const snapshot = JSON.stringify(reels);
    previewEdit(reels, { kind: 'add', reelIndex: 0, symbol: { actionId: GUARD, grade: 1 } }, OPTIONS);
    previewEdit(reels, { kind: 'delete', reelIndex: 1, symbolIndex: 0 }, OPTIONS);
    previewEdit(reels, { kind: 'enhance', reelIndex: 2, symbolIndex: 5 }, OPTIONS);
    expect(JSON.stringify(reels)).toBe(snapshot);
  });

  it('before equals analyzeReels of the input', () => {
    const { before } = previewEdit(MIXED_REELS, { kind: 'delete', reelIndex: 0, symbolIndex: 11 }, OPTIONS);
    expect(before).toEqual(analyzeReels(MIXED_REELS, OPTIONS));
  });

  it('enhance changes only the selected symbol among identical ones', () => {
    const reels = [reel('A1 A1 A1'), reel('A1 A1 A1'), reel('A1 A1 A1')];
    const { after } = previewEdit(reels, { kind: 'enhance', reelIndex: 1, symbolIndex: 2 }, OPTIONS);
    expect(after.actions[ATTACK]?.avgGradeValue).toBeCloseTo(10 / 9, 12);
  });

  it.each([
    ['reel index -1', { kind: 'delete', reelIndex: -1, symbolIndex: 0 }],
    ['reel index 3', { kind: 'add', reelIndex: 3, symbol: { actionId: ATTACK, grade: 1 } }],
    ['fractional reel index', { kind: 'enhance', reelIndex: 0.5, symbolIndex: 0 }],
    ['symbol index -1', { kind: 'delete', reelIndex: 0, symbolIndex: -1 }],
    ['symbol index past the end', { kind: 'enhance', reelIndex: 0, symbolIndex: 6 }],
    ['NaN symbol index', { kind: 'delete', reelIndex: 0, symbolIndex: Number.NaN }],
  ] as const)('throws on %s', (_, edit) => {
    expect(() => previewEdit(M2_REELS, edit, OPTIONS)).toThrow(/out of range/);
  });

  it('throws when a delete would leave fewer symbols than grid rows', () => {
    expect(() => previewEdit([reel('A1 G1 S1'), M2_START, M2_START], { kind: 'delete', reelIndex: 0, symbolIndex: 0 }, OPTIONS)).toThrow(
      /needs at least 3/,
    );
  });

  it('enhancing the highest grade throws, for a short table and for the standard top grade', () => {
    const grades: GradeTable = { 1: { id: 1, name: 'g1', value: 1 }, 2: { id: 2, name: 'g2', value: 2 } };
    const reels = [reel('A2 A1 A1'), M2_START, M2_START];
    expect(() => previewEdit(reels, { kind: 'enhance', reelIndex: 0, symbolIndex: 0 }, { grades })).toThrow(/cannot be enhanced/);
    expect(previewEdit(reels, { kind: 'enhance', reelIndex: 0, symbolIndex: 1 }, { grades }).after.actions[ATTACK]?.avgGradeValue).toBeCloseTo(
      (2 + 2 + 1 + 6 * 1) / 9,
      12,
    );
    const heroReels = [reel('A4 A1 A1'), M2_START, M2_START];
    expect(() => previewEdit(heroReels, { kind: 'enhance', reelIndex: 0, symbolIndex: 0 }, OPTIONS)).toThrow(/cannot be enhanced/);
  });

  it('gapped grade table (1, 2, 4): enhance 2 -> 4 and agrees with the run rule canEnhanceAt', () => {
    const grades: GradeTable = {
      1: { id: 1, name: 'g1', value: 10 },
      2: { id: 2, name: 'g2', value: 20 },
      4: { id: 4, name: 'g4', value: 40 },
    };
    const reels = [reel('A2 A4 A1'), M2_START, M2_START];
    const enhance = (symbolIndex: number) => () => previewEdit(reels, { kind: 'enhance', reelIndex: 0, symbolIndex }, { grades });
    reels[0]?.forEach((_, symbolIndex) => {
      const allowed = canEnhanceAt(reels, 0, symbolIndex, grades);
      if (allowed) expect(enhance(symbolIndex)).not.toThrow();
      else expect(enhance(symbolIndex)).toThrow(/cannot be enhanced/);
    });
    expect(canEnhanceAt(reels, 0, 0, grades)).toBe(true);
    expect(canEnhanceAt(reels, 0, 1, grades)).toBe(false);
    // A2 becomes A4: attack symbols A4 A4 A1 + 6 x A1 on the other reels.
    expect(enhance(0)().after.actions[ATTACK]?.avgGradeValue).toBeCloseTo((40 + 40 + 10 + 6 * 10) / 9, 12);
  });
});

describe('analyzeReels: performance', () => {
  // Budget is ~50 ms (spec 8 preview of up to 9 options); the assertion is loose to stay stable on slow CI.
  const LOOSE_BUDGET_MS = 250;

  it('12-symbol reels with 3 actions analyze well within budget', () => {
    const big = [MIXED_REELS[0] ?? M2_START, MIXED_REELS[1] ?? M2_START, reel('A1 A2 G1 G2 S1 S2 A3 G3 S3 A1 G1 S1')];
    analyzeReels(big, OPTIONS);
    const start = performance.now();
    analyzeReels(big, OPTIONS);
    expect(performance.now() - start).toBeLessThan(LOOSE_BUDGET_MS);
  });
});
