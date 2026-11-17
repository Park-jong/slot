// Presentation-only settings: placeholder icons and animation timings. Game numbers stay in src/data.
import type { ActionId, IntentType } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from '../data';
import type { EndPhase } from './format';

export const ACTION_ICONS: Readonly<Record<ActionId, string>> = {
  [ACTION_ATTACK]: '⚔️',
  [ACTION_GUARD]: '🛡️',
  [ACTION_SHIELD_BASH]: '💥',
};

export const FALLBACK_ACTION_ICON = '❔';

export const EMPTY_CELL_ICON = '❓';

export const INTENT_ICONS: Readonly<Record<IntentType, string>> = {
  attack: '🗡️',
  guard: '🛡️',
};

export const RESULT_ICONS: Readonly<Record<EndPhase, string>> = {
  victory: '🏆',
  defeat: '💀',
};

/** Reels stop left to right; the first stop waits a little so the spin is visible at all. */
export const REEL_ANIMATION = {
  firstStopMs: 450,
  stopIntervalMs: 300,
} as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
