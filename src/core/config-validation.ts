// Data checks run when a battle is created, so bad data fails fast instead of mid-battle.
import { validateEffects } from './effects';
import { isKnownIntentType, MIN_CHARGE_MULTIPLIER } from './enemy';
import { GRID_SIZE } from './lines';
import { validateTurnModifiers, validateTurnRules } from './turn-stats';
import type { ActionDef, BattleConfig, Board, CharacterDef, EnemyDef, GradeTable, Reel, TierDef, TurnRules } from './types';

/** Tier tables start at one line (a single fired line must have a tier). */
const FIRST_TIER_LINE_COUNT = 1;

export function validateBattleConfig(config: BattleConfig): void {
  validateEnemy(config.enemy);
  config.actions.forEach(validateAction);
  validateCharacter(config.character, config.actions);
  validateReels(config.reels, config.actions, config.grades);
  validateStartingHp(config);
  validateTurnRules(config.turnRules);
  validateSpinsPerTurn(config.character, config.turnRules);
  validateTurnModifiers(config.modifiers ?? []);
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
  validateTiers(action.id, action.tiers);
  validateEffects(action);
}

/** Line counts are integers, unique, and the smallest is 1 (M2.5 spec 2.4, AC-6.4). */
function validateTiers(actionId: string, tiers: readonly TierDef[]): void {
  const counts = tiers.map((tier) => tier.lineCount);
  if (counts.some((count) => !Number.isInteger(count)) || new Set(counts).size !== counts.length) {
    throw new Error(`config: action ${actionId} tier line counts ${counts.join(', ')} must be unique integers`);
  }
  if (Math.min(...counts) !== FIRST_TIER_LINE_COUNT) {
    throw new Error(`config: action ${actionId} tiers must start at ${FIRST_TIER_LINE_COUNT} line`);
  }
}

function validateSpinsPerTurn(character: CharacterDef, rules: TurnRules): void {
  const { spinsPerTurn } = character;
  const { spinsPerTurnMin, spinsPerTurnHardCap } = rules;
  if (!Number.isInteger(spinsPerTurn) || spinsPerTurn < spinsPerTurnMin || spinsPerTurn > spinsPerTurnHardCap) {
    throw new Error(
      `config: character ${character.id} spinsPerTurn ${spinsPerTurn} must be an integer in ${spinsPerTurnMin}..${spinsPerTurnHardCap}`,
    );
  }
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

/** A submitted board must have the spin() shape and use only the config's actions and grades. */
export function validateBoard(board: Board, config: BattleConfig, caller: string): void {
  if (board.length !== GRID_SIZE || board.some((column) => column.length !== GRID_SIZE)) {
    throw new Error(`${caller}: board must be ${GRID_SIZE} reels x ${GRID_SIZE} rows`);
  }
  const symbols = board.flat();
  const unknown = [...new Set(symbols.map((symbol) => symbol.actionId))].filter((id) => !hasAction(config.actions, id));
  if (unknown.length > 0) {
    throw new Error(`${caller}: board contains unknown actions ${unknown.join(', ')}`);
  }
  const badGrade = symbols.find((symbol) => !config.grades[symbol.grade]);
  if (badGrade) {
    throw new Error(`${caller}: board uses unknown grade ${badGrade.grade} on action ${badGrade.actionId}`);
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
