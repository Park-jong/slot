// Effective spin count and percent bonuses of a turn (M2.5 spec 5.1). Pure; every number comes from data.
import { PERCENT_BASE } from './outcome';
import type { BattleConfig, TurnModifier, TurnRules, TurnStats } from './types';

const MIN_SPINS_PER_TURN_FLOOR = 1;

type ModifierField = Exclude<keyof TurnModifier, 'id'>;

const MODIFIER_FIELDS: readonly ModifierField[] = ['spinsPerTurnAdd', 'spinsPerTurnMulPct', 'damagePct', 'focusPctAdd'];

/**
 * maxSpins = clamp(floor((base + sum of adds) x mulPct / 100), min, hardCap), where mulPct starts at 100 and
 * each modifier applies floor(acc x m / 100) in order. Focus per unused spin is clamped at 0.
 */
export function resolveTurnStats(baseSpins: number, rules: TurnRules, modifiers: readonly TurnModifier[]): TurnStats {
  requireInteger('base spinsPerTurn', baseSpins);
  validateTurnRules(rules);
  validateTurnModifiers(modifiers);
  const added = baseSpins + sumOf(modifiers, 'spinsPerTurnAdd');
  const mulPct = modifiers.reduce(
    (acc, modifier) => Math.floor((acc * (modifier.spinsPerTurnMulPct ?? PERCENT_BASE)) / PERCENT_BASE),
    PERCENT_BASE,
  );
  const raw = Math.floor((added * mulPct) / PERCENT_BASE);
  return {
    maxSpins: Math.min(rules.spinsPerTurnHardCap, Math.max(rules.spinsPerTurnMin, raw)),
    focusPctPerUnused: Math.max(0, rules.focusPercentPerUnusedSpin + sumOf(modifiers, 'focusPctAdd')),
    damagePct: sumOf(modifiers, 'damagePct'),
  };
}

/** Turn stats of a battle config at the current turn start. */
export function turnStatsOf(config: BattleConfig): TurnStats {
  return resolveTurnStats(config.character.spinsPerTurn, config.turnRules, config.modifiers ?? []);
}

export function validateTurnRules(rules: TurnRules): void {
  const { spinsPerTurnMin, spinsPerTurnHardCap, focusPercentPerUnusedSpin } = rules;
  if (!Number.isInteger(spinsPerTurnMin) || spinsPerTurnMin < MIN_SPINS_PER_TURN_FLOOR) {
    throw new Error(`config: spinsPerTurnMin ${spinsPerTurnMin} must be an integer >= ${MIN_SPINS_PER_TURN_FLOOR}`);
  }
  if (!Number.isInteger(spinsPerTurnHardCap) || spinsPerTurnHardCap < spinsPerTurnMin) {
    throw new Error(`config: spinsPerTurnHardCap ${spinsPerTurnHardCap} must be an integer >= spinsPerTurnMin ${spinsPerTurnMin}`);
  }
  if (!Number.isInteger(focusPercentPerUnusedSpin) || focusPercentPerUnusedSpin < 0) {
    throw new Error(`config: focusPercentPerUnusedSpin ${focusPercentPerUnusedSpin} must be a non-negative integer`);
  }
}

export function validateTurnModifiers(modifiers: readonly TurnModifier[]): void {
  for (const modifier of modifiers) {
    for (const field of MODIFIER_FIELDS) {
      const value = modifier[field];
      if (value !== undefined) {
        requireInteger(`modifier ${modifier.id} ${field}`, value);
      }
    }
    if ((modifier.spinsPerTurnMulPct ?? PERCENT_BASE) < 0) {
      throw new Error(`config: modifier ${modifier.id} spinsPerTurnMulPct ${modifier.spinsPerTurnMulPct} must be >= 0`);
    }
  }
}

function sumOf(modifiers: readonly TurnModifier[], field: ModifierField): number {
  return modifiers.reduce((sum, modifier) => sum + (modifier[field] ?? 0), 0);
}

function requireInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`config: ${name} ${value} must be an integer`);
  }
}
