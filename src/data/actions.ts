import { EFFECT_IGNORE_GUARD } from '../core/effects';
import type { ActionDef } from '../core/types';
import { STANDARD_TIERS } from './tiers';

export const ACTION_ATTACK = 'attack';
export const ACTION_GUARD = 'guard';
export const ACTION_SHIELD_BASH = 'shield_bash';

const GUARD: ActionDef = {
  id: ACTION_GUARD,
  name: '방어',
  basePower: { damage: 0, guard: 2 },
  tiers: STANDARD_TIERS,
  // Same-id stages replace each other (M2 spec 6): 3+ lines reflect 50%, not 30% + 50%.
  effects: [
    { id: 'reflect', minLines: 2, params: { percent: 30 }, deferred: true },
    { id: 'reflect', minLines: 3, params: { percent: 50 }, deferred: true },
    { id: 'guard_keep', minLines: 4, params: {}, deferred: true },
  ],
};

const SHIELD_BASH: ActionDef = {
  id: ACTION_SHIELD_BASH,
  name: '방패 강타',
  basePower: { damage: 1, guard: 1 },
  tiers: STANDARD_TIERS,
  effects: [{ id: 'stun', minLines: 2, params: {}, deferred: true }],
};

const ATTACK: ActionDef = {
  id: ACTION_ATTACK,
  name: '공격',
  basePower: { damage: 2, guard: 0 },
  tiers: STANDARD_TIERS,
  effects: [
    { id: EFFECT_IGNORE_GUARD, minLines: 2, params: {}, deferred: false },
    { id: 'weaken', minLines: 3, params: {}, deferred: true },
    { id: 'double_hit', minLines: 4, params: {}, deferred: true },
  ],
};

/** Spec 1.2 / 1.4. Array order is the resolution order: guard -> shield_bash -> attack (spec 2.6). */
export const ACTIONS: readonly ActionDef[] = [GUARD, SHIELD_BASH, ATTACK];
