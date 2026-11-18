// Line-count effects of an action (M2 spec 6, REQ-002).
import type { ActionDef, EffectDef } from './types';

export const EFFECT_IGNORE_GUARD = 'ignore_guard';

/** Effects the engine executes. Any other effect must be marked `deferred` in data. */
export const IMPLEMENTED_EFFECT_IDS: readonly string[] = [EFFECT_IGNORE_GUARD];

/**
 * Effects in force at this line count, in data order. Among entries sharing an id, only the one with
 * the highest satisfied minLines applies (lower stages are replaced, not stacked); different ids are
 * independent. Deferred effects are included: the executor is the one that skips them.
 */
export function activeEffects(action: ActionDef, lineCount: number): EffectDef[] {
  const satisfied = action.effects.filter((effect) => effect.minLines <= lineCount);
  return satisfied.filter(
    (effect) => !satisfied.some((other) => other.id === effect.id && other.minLines > effect.minLines),
  );
}

/** Active effects the engine actually runs this turn. */
export function executableEffects(action: ActionDef, lineCount: number): EffectDef[] {
  return activeEffects(action, lineCount).filter((effect) => !effect.deferred);
}

/** Data errors: duplicate (id, minLines) pairs and non-deferred effects the engine cannot run. */
export function validateEffects(action: ActionDef): void {
  action.effects.forEach((effect, index) => {
    const duplicate = action.effects.some(
      (other, otherIndex) => otherIndex !== index && other.id === effect.id && other.minLines === effect.minLines,
    );
    if (duplicate) {
      throw new Error(`config: action ${action.id} defines effect ${effect.id} at minLines ${effect.minLines} twice`);
    }
    if (!effect.deferred && !IMPLEMENTED_EFFECT_IDS.includes(effect.id)) {
      throw new Error(`config: effect ${effect.id} on ${action.id} is not implemented; mark it deferred`);
    }
  });
}
