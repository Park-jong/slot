// Data checks run when a battle is created, so bad data fails fast instead of mid-battle.
import { validateEffects } from './effects';
import { isKnownIntentType, MIN_CHARGE_MULTIPLIER } from './enemy';
import { GRID_SIZE } from './lines';
import type { ActionDef, BattleConfig, CharacterDef, EnemyDef, GradeTable, Reel } from './types';

export function validateBattleConfig(config: BattleConfig): void {
  validateEnemy(config.enemy);
  config.actions.forEach(validateAction);
  validateCharacter(config.character, config.actions);
  validateReels(config.reels, config.actions, config.grades);
  validateStartingHp(config);
}

export function validateEnemy(enemy: EnemyDef): void {
  if (!Number.isInteger(enemy.hp) || enemy.hp <= 0) {
    throw new Error(`config: enemy ${enemy.id} hp ${enemy.hp} must be a positive integer`);
  }
  for (const intent of enemy.pattern) {
    if (!isKnownIntentType(intent.type)) {
      throw new Error(`config: enemy ${enemy.id} has unknown intent type ${intent.type}`);
    }
    if (!Number.isInteger(intent.value) || intent.value <= 0) {
      throw new Error(`config: enemy ${enemy.id} intent ${intent.type} value ${intent.value} must be a positive integer`);
    }
  }
  if (enemy.pattern.length === 0) {
    throw new Error(`config: enemy ${enemy.id} has an empty pattern`);
  }
  const weakCharge = enemy.pattern.find(
    (intent) => intent.type === 'charge' && !(Number.isInteger(intent.value) && intent.value >= MIN_CHARGE_MULTIPLIER),
  );
  if (weakCharge) {
    throw new Error(`config: enemy ${enemy.id} charge multiplier ${weakCharge.value} must be an integer >= ${MIN_CHARGE_MULTIPLIER}`);
  }
}

function validateAction(action: ActionDef): void {
  if (action.tiers.length === 0) {
    throw new Error(`config: action ${action.id} has no tiers`);
  }
  validateEffects(action);
}

function validateCharacter(character: CharacterDef, actions: readonly ActionDef[]): void {
  if (!hasAction(actions, character.skillActionId)) {
    throw new Error(`config: character ${character.id} skill action ${character.skillActionId} is not defined`);
  }
}

function validateReels(reels: readonly Reel[], actions: readonly ActionDef[], grades: GradeTable): void {
  if (reels.length !== GRID_SIZE) {
    throw new Error(`config: expected ${GRID_SIZE} reels, got ${reels.length}`);
  }
  for (const symbol of reels.flat()) {
    if (!hasAction(actions, symbol.actionId)) {
      throw new Error(`config: reel symbol uses unknown action ${symbol.actionId}`);
    }
    if (!grades[symbol.grade]) {
      throw new Error(`config: reel symbol uses unknown grade ${symbol.grade}`);
    }
  }
}

function validateStartingHp({ startingHp, character }: BattleConfig): void {
  if (startingHp === undefined) {
    return;
  }
  if (!Number.isInteger(startingHp) || startingHp <= 0 || startingHp > character.maxHp) {
    throw new Error(`config: startingHp ${startingHp} must be an integer in 1..${character.maxHp}`);
  }
}

function hasAction(actions: readonly ActionDef[], actionId: string): boolean {
  return actions.some((action) => action.id === actionId);
}
