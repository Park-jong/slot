import { EFFECT_IGNORE_GUARD, executableEffects } from './effects';
import type { ActionJudgement } from './judge';
import type { ActionDef, ActionId, TierDef } from './types';

/** Tier multipliers are stored as numerators over this denominator so power stays integer math. */
export const MULTIPLIER_DENOMINATOR = 2;

/** Percent values (Focus, damage modifiers) are integers over this base: 100 = unchanged. */
export const PERCENT_BASE = 100;

export interface LineTally {
  readonly lineCount: number;
  readonly gradeSumTotal: number;
}

/** Percent bonuses of a turn (M2.5 spec 4.1): Focus applies to damage and guard, damagePct to damage only. */
export interface PowerBonus {
  readonly focusPct: number;
  readonly damagePct: number;
}

export const NO_BONUS: PowerBonus = { focusPct: 0, damagePct: 0 };

/** Per-action line tallies of a turn: a single judged board or the pooled lines of several spins. */
export interface ActionTallies {
  /** Only actions with at least one fired line are present. */
  readonly byAction: Readonly<Record<ActionId, ActionJudgement>>;
}

/** What one action produces this turn, before it is applied to the battle. */
export interface ActionOutcome extends LineTally {
  readonly actionId: ActionId;
  readonly multiplierNum: number;
  readonly damage: number;
  readonly guard: number;
  readonly ignoreGuard: boolean;
  /** Focus percent applied to this turn's damage and guard. */
  readonly focusPct: number;
  /** Damage-only percent modifier applied this turn. */
  readonly damagePct: number;
}

/**
 * floor applied exactly once to the final value (M1 spec 2.4, M2.5 spec 4.1). bonusPct is clamped so the
 * percent never goes below zero; omitted it gives the M2 value.
 */
export function power(basePower: number, gradeSumTotal: number, multiplierNum: number, bonusPct = 0): number {
  const percent = Math.max(0, PERCENT_BASE + bonusPct);
  return Math.floor((basePower * gradeSumTotal * multiplierNum * percent) / (MULTIPLIER_DENOMINATOR * PERCENT_BASE));
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

export function evaluateAction(action: ActionDef, tally: LineTally, bonus: PowerBonus = NO_BONUS): ActionOutcome {
  const { multiplierNum } = selectTier(action.tiers, tally.lineCount);
  const effects = executableEffects(action, tally.lineCount);
  return {
    actionId: action.id,
    lineCount: tally.lineCount,
    gradeSumTotal: tally.gradeSumTotal,
    multiplierNum,
    damage: power(action.basePower.damage, tally.gradeSumTotal, multiplierNum, bonus.focusPct + bonus.damagePct),
    guard: power(action.basePower.guard, tally.gradeSumTotal, multiplierNum, bonus.focusPct),
    ignoreGuard: effects.some((effect) => effect.id === EFFECT_IGNORE_GUARD),
    focusPct: bonus.focusPct,
    damagePct: bonus.damagePct,
  };
}

/** Outcomes for every fired action, ordered by the given action (resolution) order. */
export function evaluateOutcomes(
  tallies: ActionTallies,
  actions: readonly ActionDef[],
  bonus: PowerBonus = NO_BONUS,
): ActionOutcome[] {
  const unknown = Object.keys(tallies.byAction).filter((id) => !actions.some((action) => action.id === id));
  if (unknown.length > 0) {
    throw new Error(`evaluateOutcomes: board contains unknown actions ${unknown.join(', ')}`);
  }
  return actions.flatMap((action) => {
    const tally = tallies.byAction[action.id];
    return tally ? [evaluateAction(action, tally, bonus)] : [];
  });
}
