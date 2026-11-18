// Run data checks done once at startRun; per-battle data is checked by createBattle.
import { validateBattleConfig } from './config-validation';
import { GRID_SIZE } from './lines';
import { rewardCandidates } from './offers';
import type { HealAmount, RunDefinition, RunRules } from './types';

export function validateRunDefinition(definition: RunDefinition): void {
  if (definition.stages.length === 0) {
    throw new Error('run: at least one stage (the boss) is required');
  }
  validateReelLimits(definition.rules);
  validateStartingReels(definition);
  validateStages(definition);
  validateRewardTables(definition);
  validateHeal('healAfterBattle', definition.rules.healAfterBattle);
  validateHeal('healBeforeBoss', definition.rules.healBeforeBoss);
  if (!isPositiveInteger(definition.rules.editEveryNBattles)) {
    throw new Error(`run: editEveryNBattles ${definition.rules.editEveryNBattles} must be a positive integer`);
  }
}

function validateReelLimits({ reelMin, reelMax }: RunRules): void {
  if (reelMin < GRID_SIZE || reelMax < reelMin) {
    throw new Error(`run: reel limits ${reelMin}..${reelMax} must satisfy ${GRID_SIZE} <= reelMin <= reelMax`);
  }
}

function validateStartingReels({ character, rules }: RunDefinition): void {
  character.startingReels.forEach((reel, reelIndex) => {
    if (reel.length < rules.reelMin || reel.length > rules.reelMax) {
      throw new Error(`run: starting reel ${reelIndex} has ${reel.length} symbols, allowed ${rules.reelMin}..${rules.reelMax}`);
    }
  });
}

/** Every stage enemy (boss included) must be a valid battle against the starting reels. */
function validateStages({ stages, character, actions, grades, rules }: RunDefinition): void {
  for (const enemy of stages) {
    validateBattleConfig({ character, enemy, reels: character.startingReels, actions, grades, turnRules: rules });
  }
}

/** Every reward step (k = 1 .. regular battle count) must be able to fill all offers. */
function validateRewardTables(definition: RunDefinition): void {
  const { stages, rules } = definition;
  for (let cleared = 1; cleared < stages.length; cleared++) {
    validateRewardIds(definition, cleared);
    const candidates = rewardCandidates(rules, cleared);
    if (candidates.length < rules.offerCount) {
      throw new Error(`run: ${candidates.length} reward candidates after battle ${cleared}, need ${rules.offerCount}`);
    }
  }
}

function validateRewardIds({ actions, grades, rules }: RunDefinition, cleared: number): void {
  for (const { actionId } of rules.actionWeights) {
    if (!actions.some((action) => action.id === actionId)) {
      throw new Error(`run: reward action ${actionId} is not defined`);
    }
  }
  for (const { grade } of rules.gradeWeightsByCleared[cleared] ?? []) {
    if (!grades[grade]) {
      throw new Error(`run: reward grade ${grade} (after battle ${cleared}) is not defined`);
    }
  }
}

function validateHeal(name: string, amount: HealAmount): void {
  if (amount !== 'full' && !(Number.isInteger(amount) && amount >= 0)) {
    throw new Error(`run: ${name} ${amount} must be 'full' or a non-negative integer`);
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
