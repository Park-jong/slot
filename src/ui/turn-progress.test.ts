import { describe, expect, it } from 'vitest';
import { createBattle, createBattleFromState, createRng, estimateContinue, previewStop, stopSpinning, submitSpin } from '../core';
import { createStartingBattleConfig } from '../data';
import { boardFromRows, SINGLE_ATTACK_BOARD } from '../test-support/test-helpers';
import { BATTLE_OVER, turnProgress, type EstimateSettings } from './turn-progress';

const SETTINGS: EstimateSettings = { samples: 50, seed: 7 };
const config = createStartingBattleConfig('slime');

describe('turnProgress', () => {
  it('is over without a battle or once the battle ended', () => {
    expect(turnProgress(null, SETTINGS)).toBe(BATTLE_OVER);
    const nearlyDead = createBattleFromState(config, { ...createBattle(config).state, enemyHp: 1 });
    const won = stopSpinning(submitSpin(nearlyDead, SINGLE_ATTACK_BOARD).battle).battle;
    expect(won.session).toBeNull();
    expect(turnProgress(won, SETTINGS)).toBe(BATTLE_OVER);
  });

  it('turn start carries the turn stats', () => {
    expect(turnProgress(createBattle(config), SETTINGS)).toEqual({
      kind: 'turn_start',
      stats: { maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 },
    });
  });

  it('spinning carries the spins, counts, the engine preview and a reproducible estimate from its own rng', () => {
    const spinning = submitSpin(createBattle(config), boardFromRows(['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1'])).battle;
    const progress = turnProgress(spinning, SETTINGS);
    if (progress.kind !== 'spinning') throw new Error(`expected spinning, got ${progress.kind}`);
    expect(progress.spinsUsed).toBe(1);
    expect(progress.remainingSpins).toBe(2);
    expect(progress.spins).toBe(spinning.session?.kind === 'spinning' ? spinning.session.spins : null);
    expect(progress.preview).toEqual(previewStop(spinning));
    expect(progress.estimate).toEqual(estimateContinue(spinning, { rng: createRng(SETTINGS.seed), samples: SETTINGS.samples }));
    expect(turnProgress(spinning, SETTINGS)).toEqual(progress);
    expect(turnProgress(spinning, null)).toMatchObject({ kind: 'spinning', estimate: null });
  });
});
