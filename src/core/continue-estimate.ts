// "Spin exactly once more, then stop" averages for the stop/continue choice (M2.5 spec 2.6, P2). Uses its own
// rng, never the battle's, so asking for an estimate does not change how the run replays.
import { previewOf, type Battle } from './battle';
import type { Rng } from './rng';
import { spin } from './spin';
import { requireSpinning, withSpin } from './turn-session';

export interface ContinueEstimateOptions {
  /** Separate from the battle rng. */
  readonly rng: Rng;
  readonly samples: number;
}

export interface ContinueEstimate {
  readonly samples: number;
  readonly averageDamage: number;
  readonly averageGuard: number;
  /** Share of samples where stopping after the extra spin defeats the enemy. */
  readonly lethalChance: number;
}

export function estimateContinue(battle: Battle, { rng, samples }: ContinueEstimateOptions): ContinueEstimate {
  const session = requireSpinning(battle.session, battle.state, 'estimateContinue');
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new Error(`estimateContinue: samples ${samples} must be a positive integer`);
  }
  let damage = 0;
  let guard = 0;
  let lethal = 0;
  for (let sample = 0; sample < samples; sample++) {
    const next = withSpin(session, spin(battle.config.reels, rng), battle.config.grades);
    const preview = previewOf(battle, next);
    damage += preview.totalDamage;
    guard += preview.totalGuard;
    lethal += preview.lethal ? 1 : 0;
  }
  return { samples, averageDamage: damage / samples, averageGuard: guard / samples, lethalChance: lethal / samples };
}
