// "If you stop now" view of a spinning turn (M2.5 spec 2.6), built from the same Settlement stopSpinning uses.
import type { PooledJudgement } from './judge';
import type { ActionOutcome } from './outcome';
import type { Settlement } from './settlement';
import type { ActionDef, ActionId, EffectId } from './types';

export interface EffectThreshold {
  readonly id: EffectId;
  readonly minLines: number;
}

export interface StopPreviewAction {
  readonly actionId: ActionId;
  readonly lineCount: number;
  readonly gradeSumTotal: number;
  readonly multiplierNum: number;
  /** Pooled line count where the next tier starts; null at the last tier. */
  readonly nextTierAt: number | null;
  /** Engine-executed (non-deferred) effects not reached yet, by minLines ascending. */
  readonly nextEffects: readonly EffectThreshold[];
  readonly damage: number;
  readonly guard: number;
  readonly ignoreGuard: boolean;
}

export interface StopPreview {
  readonly spinsUsed: number;
  readonly maxSpins: number;
  readonly unusedSpins: number;
  readonly focusPct: number;
  readonly damagePct: number;
  readonly pooled: PooledJudgement;
  /** Fired actions only, in resolution order. */
  readonly actions: readonly StopPreviewAction[];
  readonly totalDamage: number;
  readonly totalGuard: number;
  /** Nothing fired in any spin so far. */
  readonly empty: boolean;
  /** Effective attack value of this turn's enemy action (charge applied); 0 if it does not attack. */
  readonly incoming: number;
  /** Stopping now defeats the enemy (enemy guard and ignore_guard applied). */
  readonly lethal: boolean;
  /** Player HP after the enemy acts (unchanged when lethal). */
  readonly playerHpAfterEnemy: number;
}

export function buildStopPreview(settlement: Settlement, actions: readonly ActionDef[], incoming: number): StopPreview {
  const { outcomes } = settlement;
  return {
    spinsUsed: settlement.spinsUsed,
    maxSpins: settlement.stats.maxSpins,
    unusedSpins: settlement.unusedSpins,
    focusPct: settlement.focusPct,
    damagePct: settlement.stats.damagePct,
    pooled: settlement.pooled,
    actions: outcomes.map((outcome) => previewAction(outcome, actionById(actions, outcome.actionId))),
    totalDamage: outcomes.reduce((sum, outcome) => sum + outcome.damage, 0),
    totalGuard: outcomes.reduce((sum, outcome) => sum + outcome.guard, 0),
    empty: outcomes.length === 0,
    incoming,
    lethal: settlement.resolved.state.enemyHp <= 0,
    playerHpAfterEnemy: settlement.finished.state.playerHp,
  };
}

function previewAction(outcome: ActionOutcome, action: ActionDef): StopPreviewAction {
  const { lineCount } = outcome;
  const higherTiers = action.tiers.map((tier) => tier.lineCount).filter((count) => count > lineCount);
  return {
    actionId: outcome.actionId,
    lineCount,
    gradeSumTotal: outcome.gradeSumTotal,
    multiplierNum: outcome.multiplierNum,
    nextTierAt: higherTiers.length > 0 ? Math.min(...higherTiers) : null,
    nextEffects: action.effects
      .filter((effect) => !effect.deferred && effect.minLines > lineCount)
      .map(({ id, minLines }) => ({ id, minLines }))
      .sort((a, b) => a.minLines - b.minLines),
    damage: outcome.damage,
    guard: outcome.guard,
    ignoreGuard: outcome.ignoreGuard,
  };
}

/** Outcomes only exist for config actions (evaluateOutcomes rejects unknown ones), so the lookup succeeds. */
function actionById(actions: readonly ActionDef[], actionId: ActionId): ActionDef {
  const action = actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`previewStop: unknown action ${actionId}`);
  }
  return action;
}
