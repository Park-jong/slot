import { describe, expect, it } from 'vitest';
import { createM2BattleConfig, M2_ACTIONS } from '../data';
import { createBattle } from './battle';
import { activeEffects, executableEffects } from './effects';
import type { ActionDef, EffectDef } from './types';

function action(id: string): ActionDef {
  const found = M2_ACTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing action ${id}`);
  return found;
}

const summary = (effects: readonly EffectDef[]) =>
  effects.map((effect) => (effect.params['percent'] === undefined ? effect.id : `${effect.id} ${effect.params['percent']}`));

describe('M2 example 6: activeEffects keeps only the highest satisfied stage per id', () => {
  it('guard 3 lines -> [reflect 50] only (reflect 30 is replaced)', () => {
    expect(summary(activeEffects(action('guard'), 3))).toEqual(['reflect 50']);
  });

  it('guard 2 lines -> [reflect 30]', () => {
    expect(summary(activeEffects(action('guard'), 2))).toEqual(['reflect 30']);
  });

  it('guard 4 lines -> [reflect 50, guard_keep]', () => {
    expect(summary(activeEffects(action('guard'), 4))).toEqual(['reflect 50', 'guard_keep']);
  });

  it('attack 3 lines -> [ignore_guard, weaken] (different ids are independent)', () => {
    expect(summary(activeEffects(action('attack'), 3))).toEqual(['ignore_guard', 'weaken']);
  });

  it('matches the spec 6 table for every line count', () => {
    const table = (id: string) => [1, 2, 3, 4, 8].map((lines) => summary(activeEffects(action(id), lines)));
    expect(table('guard')).toEqual([[], ['reflect 30'], ['reflect 50'], ['reflect 50', 'guard_keep'], ['reflect 50', 'guard_keep']]);
    expect(table('attack')).toEqual([
      [],
      ['ignore_guard'],
      ['ignore_guard', 'weaken'],
      ['ignore_guard', 'weaken', 'double_hit'],
      ['ignore_guard', 'weaken', 'double_hit'],
    ]);
    expect(table('shield_bash')).toEqual([[], ['stun'], ['stun'], ['stun'], ['stun']]);
  });

  it('the executor runs only non-deferred effects (ignore_guard in M2)', () => {
    expect(summary(executableEffects(action('attack'), 4))).toEqual(['ignore_guard']);
    expect(executableEffects(action('guard'), 4)).toEqual([]);
  });

  it('data error: two reflect entries at minLines 2 -> createBattle throws', () => {
    const duplicated = M2_ACTIONS.map((candidate) =>
      candidate.id === 'guard'
        ? {
            ...candidate,
            effects: [...candidate.effects, { id: 'reflect', minLines: 2, params: { percent: 40 }, deferred: true }],
          }
        : candidate,
    );
    expect(() => createBattle({ ...createM2BattleConfig('slime'), actions: duplicated })).toThrow(
      /effect reflect at minLines 2 twice/,
    );
  });
});
