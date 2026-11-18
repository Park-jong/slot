import { EFFECT_IGNORE_GUARD } from '../core/effects';
import type { ActionDef, TierDef } from '../core/types';
import { M2_TIERS, STANDARD_TIERS } from './tiers';

export const ACTION_ATTACK = 'attack';
export const ACTION_GUARD = 'guard';
export const ACTION_SHIELD_BASH = 'shield_bash';

/** The two numbers that differ between the M2 and M2.5 action sets (M2.5 spec 6.1). */
interface ActionSetRules {
  readonly tiers: readonly TierDef[];
  /** Pooled attack lines per turn needed for ignore_guard. */
  readonly ignoreGuardMinLines: number;
}

/** Array order is the resolution order: guard -> shield_bash -> attack (M1 spec 2.6). */
function createActions({ tiers, ignoreGuardMinLines }: ActionSetRules): readonly ActionDef[] {
  const guard: ActionDef = {
    id: ACTION_GUARD,
    name: '방어',
    basePower: { damage: 0, guard: 2 },
    tiers,
    // Same-id stages replace each other (M2 spec 6): 3+ lines reflect 50%, not 30% + 50%.
    effects: [
      { id: 'reflect', minLines: 2, params: { percent: 30 }, deferred: true },
      { id: 'reflect', minLines: 3, params: { percent: 50 }, deferred: true },
      { id: 'guard_keep', minLines: 4, params: {}, deferred: true },
    ],
  };
  const shieldBash: ActionDef = {
    id: ACTION_SHIELD_BASH,
    name: '방패 강타',
    basePower: { damage: 1, guard: 1 },
    tiers,
    effects: [{ id: 'stun', minLines: 2, params: {}, deferred: true }],
  };
  const attack: ActionDef = {
    id: ACTION_ATTACK,
    name: '공격',
    basePower: { damage: 2, guard: 0 },
    tiers,
    effects: [
      { id: EFFECT_IGNORE_GUARD, minLines: ignoreGuardMinLines, params: {}, deferred: false },
      { id: 'weaken', minLines: 3, params: {}, deferred: true },
      { id: 'double_hit', minLines: 4, params: {}, deferred: true },
    ],
  };
  return [guard, shieldBash, attack];
}

/** M2.5 product actions: tiers x1 / x1.5 / x2, ignore_guard from 3 pooled attack lines. */
export const ACTIONS: readonly ActionDef[] = createActions({ tiers: STANDARD_TIERS, ignoreGuardMinLines: 3 });

/** M2 actions (four tiers, ignore_guard from 2 lines), kept for the M1/M2 regression and balance tests. */
export const M2_ACTIONS: readonly ActionDef[] = createActions({ tiers: M2_TIERS, ignoreGuardMinLines: 2 });
