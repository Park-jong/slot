import { EFFECT_IGNORE_GUARD, executableEffects } from './effects';
import type { JudgeResult } from './judge';
import type { ActionDef, ActionId, TierDef } from './types';

/** Tier multipliers are stored as numerators over this denominator so power stays integer math. */
export const MULTIPLIER_DENOMINATOR = 2;

export interface LineTally {
  readonly lineCount: number;
  readonly gradeSumTotal: number;
}

/** What one action produces this turn, before it is applied to the battle. */
export interface ActionOutcome extends LineTally {
  readonly actionId: ActionId;
  readonly multiplierNum: number;
  readonly damage: number;
  readonly guard: number;
  readonly ignoreGuard: boolean;
}

/** floor applied exactly once to the final value (spec 2.4). */
export function power(basePower: number, gradeSumTotal: number, multiplierNum: number): number {
  return Math.floor((basePower * gradeSumTotal * multiplierNum) / MULTIPLIER_DENOMINATOR);
}

/**
 * Tier with the largest lineCount not exceeding the given count, independent of array order;
 * this caps line counts above the top tier.
 */
export function selectTier(tiers: readonly TierDef[], lineCount: number): TierDef {
  const tier = tiers
    .filter((candidate) => candidate.lineCount <= lineCount)
    .reduce<TierDef | undefined>(
      (best, candidate) => (best && best.lineCount >= candidate.lineCount ? best : candidate),
      undefined,
    );
  if (!tier) {
    throw new Error(`selectTier: no tier for line count ${lineCount}`);
  }
  return tier;
}

export function evaluateAction(action: ActionDef, tally: LineTally): ActionOutcome {
  const { multiplierNum } = selectTier(action.tiers, tally.lineCount);
  const effects = executableEffects(action, tally.lineCount);
  return {
    actionId: action.id,
    lineCount: tally.lineCount,
    gradeSumTotal: tally.gradeSumTotal,
    multiplierNum,
    damage: power(action.basePower.damage, tally.gradeSumTotal, multiplierNum),
    guard: power(action.basePower.guard, tally.gradeSumTotal, multiplierNum),
    ignoreGuard: effects.some((effect) => effect.id === EFFECT_IGNORE_GUARD),
  };
}

/** Outcomes for every fired action, ordered by the given action (resolution) order. */
export function evaluateOutcomes(judgement: JudgeResult, actions: readonly ActionDef[]): ActionOutcome[] {
  const unknown = Object.keys(judgement.byAction).filter((id) => !actions.some((action) => action.id === id));
  if (unknown.length > 0) {
    throw new Error(`evaluateOutcomes: board contains unknown actions ${unknown.join(', ')}`);
  }
  return actions.flatMap((action) => {
    const tally = judgement.byAction[action.id];
    return tally ? [evaluateAction(action, tally)] : [];
  });
}
