import type { BattleEvent, StepResult } from './events';
import type { BattleState, EnemyDef, Intent, IntentType } from './types';

export function intentAt(enemy: EnemyDef, enemyActionIndex: number): Intent {
  const intent = enemy.pattern[enemyActionIndex % enemy.pattern.length];
  if (!intent) {
    throw new Error(`enemy ${enemy.id} has an empty pattern`);
  }
  return intent;
}

type IntentHandler = (state: BattleState, value: number) => StepResult;

// New intent kinds (e.g. M2 charge) are added here as one more handler.
const INTENT_HANDLERS: Readonly<Record<IntentType, IntentHandler>> = {
  attack: (state, value) => {
    const absorbed = Math.min(state.playerGuard, value);
    const hpLoss = value - absorbed;
    const next = { ...state, playerGuard: state.playerGuard - absorbed, playerHp: state.playerHp - hpLoss };
    const event: BattleEvent = {
      type: 'enemy_attacked',
      value,
      absorbed,
      hpLoss,
      playerHp: next.playerHp,
      playerGuard: next.playerGuard,
    };
    return { state: next, events: [event] };
  },
  guard: (state, value) => ({
    state: { ...state, enemyGuard: value },
    events: [{ type: 'enemy_guarded', value, enemyGuard: value }],
  }),
};

/**
 * Turn step 7: the enemy's previous guard expires right before it acts, then it performs the
 * current intent and advances its pattern index.
 */
export function enemyAct(state: BattleState, enemy: EnemyDef): StepResult {
  const intent = intentAt(enemy, state.enemyActionIndex);
  const expiredEvents: BattleEvent[] =
    state.enemyGuard > 0 ? [{ type: 'enemy_guard_expired', amount: state.enemyGuard }] : [];
  const acted = INTENT_HANDLERS[intent.type]({ ...state, enemyGuard: 0 }, intent.value);
  return {
    state: { ...acted.state, enemyActionIndex: state.enemyActionIndex + 1 },
    events: [...expiredEvents, ...acted.events],
  };
}
