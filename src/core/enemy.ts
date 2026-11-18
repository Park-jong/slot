import type { BattleEvent, StepResult } from './events';
import type { BattleState, EnemyDef, Intent, IntentType } from './types';

/** enemyChargeMult when no charge is pending (attacks deal their pattern value). */
export const UNCHARGED_MULTIPLIER = 1;

/** A charge intent must at least double the next attack (M2 spec 7.1). */
export const MIN_CHARGE_MULTIPLIER = 2;

/** What the UI shows for the current intent (M2 spec 7.2). */
export interface IntentPreview {
  readonly type: IntentType;
  /** attack: effective damage (base x charge multiplier); guard: guard amount; charge: multiplier. */
  readonly value: number;
  /** Value written in the enemy pattern. */
  readonly baseValue: number;
  /** True for an attack boosted by a pending charge. */
  readonly charged: boolean;
  /** Only on a charge: the following intent with the charge applied. */
  readonly next?: IntentPreview;
}

interface IntentKind {
  /** Whether a pending charge multiplies this intent's value (and is consumed by it). */
  readonly usesCharge: boolean;
  /** Whether performing this intent damages the player (its preview value is the incoming damage). */
  readonly hitsPlayer: boolean;
  readonly act: (state: BattleState, baseValue: number) => StepResult;
}

// New intent kinds are added here as one more entry.
export function isKnownIntentType(type: string): type is IntentType {
  return Object.hasOwn(INTENT_KINDS, type);
}

const INTENT_KINDS: Readonly<Record<IntentType, IntentKind>> = {
  attack: {
    usesCharge: true,
    hitsPlayer: true,
    act: (state, baseValue) => {
      const value = baseValue * state.enemyChargeMult;
      const absorbed = Math.min(state.playerGuard, value);
      const hpLoss = value - absorbed;
      const next: BattleState = {
        ...state,
        playerGuard: state.playerGuard - absorbed,
        playerHp: state.playerHp - hpLoss,
        enemyChargeMult: UNCHARGED_MULTIPLIER,
      };
      const event: BattleEvent = {
        type: 'enemy_attacked',
        value,
        baseValue,
        absorbed,
        hpLoss,
        playerHp: next.playerHp,
        playerGuard: next.playerGuard,
      };
      return { state: next, events: [event] };
    },
  },
  // Guard leaves a pending charge untouched: it carries over to the next attack.
  guard: {
    usesCharge: false,
    hitsPlayer: false,
    act: (state, value) => ({
      state: { ...state, enemyGuard: value },
      events: [{ type: 'enemy_guarded', value, enemyGuard: value }],
    }),
  },
  // Overwrites (never stacks) the pending multiplier.
  charge: {
    usesCharge: false,
    hitsPlayer: false,
    act: (state, multiplier) => ({
      state: { ...state, enemyChargeMult: multiplier },
      events: [{ type: 'enemy_charged', multiplier }],
    }),
  },
};

export function intentAt(enemy: EnemyDef, enemyActionIndex: number): Intent {
  const intent = enemy.pattern[enemyActionIndex % enemy.pattern.length];
  if (!intent) {
    throw new Error(`enemy ${enemy.id} has an empty pattern`);
  }
  return intent;
}

/**
 * Turn step 7: the enemy's previous guard expires right before it acts, then it performs the
 * current intent and advances its pattern index.
 */
export function enemyAct(state: BattleState, enemy: EnemyDef): StepResult {
  const intent = intentAt(enemy, state.enemyActionIndex);
  const expiredEvents: BattleEvent[] =
    state.enemyGuard > 0 ? [{ type: 'enemy_guard_expired', amount: state.enemyGuard }] : [];
  const acted = INTENT_KINDS[intent.type].act({ ...state, enemyGuard: 0 }, intent.value);
  return {
    state: { ...acted.state, enemyActionIndex: state.enemyActionIndex + 1 },
    events: [...expiredEvents, ...acted.events],
  };
}

/** Preview of the intent the enemy performs this turn; a charge also previews the boosted next intent. */
export function intentPreview(state: BattleState, enemy: EnemyDef): IntentPreview {
  const current = previewOf(intentAt(enemy, state.enemyActionIndex), state.enemyChargeMult);
  if (current.type !== 'charge') {
    return current;
  }
  return { ...current, next: previewOf(intentAt(enemy, state.enemyActionIndex + 1), current.value) };
}

function previewOf(intent: Intent, chargeMult: number): IntentPreview {
  const charged = INTENT_KINDS[intent.type].usesCharge && chargeMult > UNCHARGED_MULTIPLIER;
  return {
    type: intent.type,
    value: charged ? intent.value * chargeMult : intent.value,
    baseValue: intent.value,
    charged,
  };
}

/** Effective damage the current intent deals to the player this turn (charge applied); 0 if it does not attack. */
export function incomingDamage(state: BattleState, enemy: EnemyDef): number {
  const preview = intentPreview(state, enemy);
  return INTENT_KINDS[preview.type].hitsPlayer ? preview.value : 0;
}
