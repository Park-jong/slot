// What the battle screen needs to know about the turn in progress (M2.5 spec 2.1, 7.1): the spin phase state,
// the engine's stop preview and the optional "one more spin" estimate. Pure: no DOM, every value from the engine.
import {
  createRng,
  estimateContinue,
  previewStop,
  type Battle,
  type ContinueEstimate,
  type SpinRecord,
  type StopPreview,
  type TurnStats,
} from '../core';

/** Samples and seed of the continue estimate; its rng is never the run's (spec 8.3). */
export interface EstimateSettings {
  readonly samples: number;
  readonly seed: number;
}

/** The battle is over (or there is no battle): no spin input is possible. */
export interface OverProgress {
  readonly kind: 'over';
}

/** Before the first spin of a turn: only spinning is possible. */
export interface TurnStartProgress {
  readonly kind: 'turn_start';
  readonly stats: TurnStats;
}

/** After 1..maxSpins-1 spins: spin again or stop. */
export interface SpinningProgress {
  readonly kind: 'spinning';
  readonly stats: TurnStats;
  readonly spins: readonly SpinRecord[];
  readonly spinsUsed: number;
  readonly remainingSpins: number;
  readonly preview: StopPreview;
  /** Null when estimates are turned off. */
  readonly estimate: ContinueEstimate | null;
}

export type TurnProgress = OverProgress | TurnStartProgress | SpinningProgress;

export const BATTLE_OVER: OverProgress = { kind: 'over' };

/**
 * Turn progress of a battle. The estimate uses a fresh rng from the settings' seed on every call, so the same
 * battle state always shows the same estimate and the run rng is untouched.
 */
export function turnProgress(battle: Battle | null, estimate: EstimateSettings | null): TurnProgress {
  const session = battle?.session;
  if (!battle || !session) {
    return BATTLE_OVER;
  }
  if (session.kind === 'turn_start') {
    return { kind: 'turn_start', stats: session.stats };
  }
  const spinsUsed = session.spins.length;
  return {
    kind: 'spinning',
    stats: session.stats,
    spins: session.spins,
    spinsUsed,
    remainingSpins: session.stats.maxSpins - spinsUsed,
    preview: previewStop(battle),
    estimate: estimate ? estimateContinue(battle, { rng: createRng(estimate.seed), samples: estimate.samples }) : null,
  };
}
