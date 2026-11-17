import type { BattleEvent, StepResult } from './events';
import type { ActionOutcome } from './outcome';
import type { BattleState } from './types';

/** Turn step 1: the player's guard from the previous turn expires. */
export function startTurn(state: BattleState): StepResult {
  const events: BattleEvent[] =
    state.playerGuard > 0 ? [{ type: 'player_guard_expired', amount: state.playerGuard }] : [];
  return { state: { ...state, playerGuard: 0 }, events };
}

/**
 * Turn step 5: applies outcomes in the given order (the caller passes them in resolution order).
 * Within one action, damage lands before its guard is gained, as shield_bash requires.
 */
export function resolvePlayerActions(state: BattleState, outcomes: readonly ActionOutcome[]): StepResult {
  let current = state;
  const events: BattleEvent[] = [];
  for (const outcome of outcomes) {
    if (outcome.damage > 0) {
      const hit = dealToEnemy(current, outcome);
      current = hit.state;
      events.push(...hit.events);
    }
    if (outcome.guard > 0) {
      const playerGuard = current.playerGuard + outcome.guard;
      current = { ...current, playerGuard };
      events.push({ type: 'player_guard_gained', actionId: outcome.actionId, amount: outcome.guard, playerGuard });
    }
  }
  return { state: current, events };
}

/** ignore_guard damage skips enemy guard entirely and leaves it unchanged; overkill is allowed. */
function dealToEnemy(state: BattleState, outcome: ActionOutcome): StepResult {
  const absorbed = outcome.ignoreGuard ? 0 : Math.min(state.enemyGuard, outcome.damage);
  const hpLoss = outcome.damage - absorbed;
  const next = { ...state, enemyGuard: state.enemyGuard - absorbed, enemyHp: state.enemyHp - hpLoss };
  const event: BattleEvent = {
    type: 'enemy_damaged',
    actionId: outcome.actionId,
    damage: outcome.damage,
    absorbed,
    hpLoss,
    ignoreGuard: outcome.ignoreGuard,
    enemyHp: next.enemyHp,
    enemyGuard: next.enemyGuard,
  };
  return { state: next, events: [event] };
}
