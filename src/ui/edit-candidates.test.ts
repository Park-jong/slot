import { describe, expect, it } from 'vitest';
import { createRng, previewEdit, skipOffer, startRun, type Run, type RunDefinition } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, M25_RUN, M2_RUN, RUN_RULES } from '../data';
import { definitionWithReels, winBattle } from '../test-support/run-helpers';
import { scriptedRng } from '../test-support/test-helpers';
import { analysisOptions, offerChoices, symbolEditChoices, turnSpins, type SymbolEditCandidate } from './edit-candidates';

const START_REEL = 'A1 A1 A1 G1 S1 S1';
const FULL_REEL = 'A1 A1 A1 A1 G1 G1 G1 G1 S1 S1 S1 S1';
const MIN_REEL = 'A1 G1 S1';

/** Run in reward_add after battle 1 with the spec example 1a offers: attack(1), guard(2), shield_bash(2). */
function atReward(definition: RunDefinition = M2_RUN): Run {
  return winBattle(startRun(definition), 36, scriptedRng([0, 0.5, 0.999])).run;
}

/** Run in reward_edit after battle 3 (adds skipped). */
function atEdit(definition: RunDefinition): Run {
  const rng = createRng(1);
  let run = startRun(definition);
  while (run.state.phase !== 'reward_edit') {
    run = run.state.phase === 'battle' ? winBattle(run, run.state.maxHp, rng).run : skipOffer(run).run;
  }
  return run;
}

describe('analysisOptions and turnSpins (M2.5 spec 7.2)', () => {
  it('lists every action in display order, uses the data grades and the effective max spins of a turn', () => {
    expect(analysisOptions(startRun(M25_RUN))).toEqual({
      grades: M25_RUN.grades,
      actionIds: [ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH],
      spins: 3,
      spinsPerTurnHardCap: RUN_RULES.spinsPerTurnHardCap,
    });
    expect(analysisOptions(startRun(M2_RUN)).spins).toBe(1);
  });

  it('applies the run turn modifiers (item hook) through resolveTurnStats, clamped at the hard cap', () => {
    const run = startRun(M25_RUN);
    const withModifier = (spinsPerTurnAdd: number): Run => ({
      ...run,
      state: { ...run.state, modifiers: [{ id: 'test_item', spinsPerTurnAdd }] },
    });
    expect(turnSpins(withModifier(1))).toBe(4);
    expect(turnSpins(withModifier(9))).toBe(RUN_RULES.spinsPerTurnHardCap);
  });
});

describe('offerChoices', () => {
  it('is empty outside reward_add', () => {
    expect(offerChoices(startRun(M2_RUN))).toEqual([]);
  });

  it('gives offers x reels candidates whose previews equal the engine previewEdit', () => {
    const run = atReward();
    const choices = offerChoices(run);
    expect(choices.map((choice) => choice.symbol)).toEqual([
      { actionId: ACTION_ATTACK, grade: 1 },
      { actionId: ACTION_GUARD, grade: 2 },
      { actionId: ACTION_SHIELD_BASH, grade: 2 },
    ]);
    expect(choices.flatMap((choice) => choice.candidates)).toHaveLength(9);
    const guardToReel1 = choices[1]?.candidates[1];
    expect(guardToReel1).toMatchObject({ offerIndex: 1, reelIndex: 1 });
    const expected = previewEdit(
      run.state.reels,
      { kind: 'add', reelIndex: 1, symbol: { actionId: ACTION_GUARD, grade: 2 } },
      analysisOptions(run),
    );
    expect(guardToReel1?.preview).toEqual(expected);
  });

  it('previews the M2.5 run at turn level (3 spins pooled)', () => {
    const preview = offerChoices(atReward(M25_RUN))[0]?.candidates[0]?.preview;
    expect(preview?.before.empty).toBeCloseTo(0.0903, 4);
    expect(preview?.before.actions[ACTION_ATTACK]?.fire3plus).toBeCloseTo(0.1802, 4);
  });

  it('disables a full reel (engine canAddToReel) and keeps the others', () => {
    const run = atReward(definitionWithReels([FULL_REEL, START_REEL, START_REEL]));
    for (const choice of offerChoices(run)) {
      expect(choice.candidates.map((candidate) => candidate.preview !== null)).toEqual([false, true, true]);
    }
  });
});

describe('symbolEditChoices', () => {
  it('one delete and one enhance candidate per reel x distinct symbol kind, at the first matching index', () => {
    const { deletions, enhancements } = symbolEditChoices(atEdit(M2_RUN));
    expect(deletions).toHaveLength(9);
    expect(enhancements).toHaveLength(9);
    expect(deletions.slice(0, 3).map(({ reelIndex, symbolIndex, symbol, count }) => ({ reelIndex, symbolIndex, symbol, count }))).toEqual([
      { reelIndex: 0, symbolIndex: 0, symbol: { actionId: ACTION_ATTACK, grade: 1 }, count: 3 },
      { reelIndex: 0, symbolIndex: 3, symbol: { actionId: ACTION_GUARD, grade: 1 }, count: 1 },
      { reelIndex: 0, symbolIndex: 4, symbol: { actionId: ACTION_SHIELD_BASH, grade: 1 }, count: 2 },
    ]);
    expect([...deletions, ...enhancements].every((candidate) => candidate.preview !== null)).toBe(true);
  });

  it('spec example 2 through the edit screen: deleting reel 2 G1 makes guard impossible (0%)', () => {
    const { deletions } = symbolEditChoices(atEdit(M2_RUN));
    const guardOnReel2 = deletions.find(
      (candidate) => candidate.reelIndex === 1 && candidate.symbol.actionId === ACTION_GUARD,
    );
    expect(guardOnReel2?.symbolIndex).toBe(3);
    expect(guardOnReel2?.preview?.after.actions[ACTION_GUARD]?.fire).toBe(0);
  });

  it('disables deletion on a minimum-size reel and enhancement at the top grade', () => {
    const run = atEdit(definitionWithReels([MIN_REEL, 'A4 A4 A4 G1', START_REEL]));
    const { deletions, enhancements } = symbolEditChoices(run);
    const enabledOn = (candidates: readonly SymbolEditCandidate[], reelIndex: number) =>
      candidates.filter((candidate) => candidate.reelIndex === reelIndex).map((candidate) => candidate.preview !== null);
    expect(enabledOn(deletions, 0)).toEqual([false, false, false]);
    expect(enabledOn(deletions, 1)).toEqual([true, true]);
    expect(enabledOn(enhancements, 1)).toEqual([false, true]);
    const heroAttack = enhancements.find((candidate) => candidate.reelIndex === 1 && candidate.symbol.grade === 4);
    const commonGuard = enhancements.find((candidate) => candidate.reelIndex === 1 && candidate.symbol.actionId === ACTION_GUARD);
    expect(heroAttack?.preview).toBeNull();
    expect(commonGuard?.preview).not.toBeNull();
  });
});
