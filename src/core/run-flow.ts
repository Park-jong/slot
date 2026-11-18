// Internal run transitions (M2 spec 1.2): settle a finished battle, heal, and enter the next phase,
// including the automatic skip/pass when no add or edit is possible. The public API lives in run.ts.
import { createBattle, type Battle } from './battle';
import type { RunEvent } from './events';
import { drawOffers } from './offers';
import { allReelsFull, anyDeletable, anyEnhanceable } from './reel-edit';
import type { Rng } from './rng';
import type { HealAmount, Reel, ReelSymbol, RunDefinition } from './types';

export type RunPhase = 'battle' | 'reward_add' | 'reward_edit' | 'victory' | 'defeat';

export interface RunState {
  readonly phase: RunPhase;
  /**
   * Battle being fought (battle), just cleared (reward_add, reward_edit), the boss (victory) or the
   * battle that was lost (defeat). 0-based; the last stage is the boss.
   */
  readonly stageIndex: number;
  /** Current reels; they become the next battle's BattleConfig.reels. Final reels on victory/defeat. */
  readonly reels: readonly Reel[];
  /** HP carried between battles. During a battle the live value is battle.state.playerHp. */
  readonly playerHp: number;
  readonly maxHp: number;
  /** Drawn once on entering reward_add; null in every other phase. */
  readonly offers: readonly ReelSymbol[] | null;
  /** Current battle; the final battle on victory/defeat; null during reward phases. */
  readonly battle: Battle | null;
}

export interface Transition {
  readonly state: RunState;
  readonly events: readonly RunEvent[];
}

export function bossStageIndex(definition: RunDefinition): number {
  return definition.stages.length - 1;
}

/** Battles cleared so far; during the reward phases this is the spec's k. */
export function clearedCount(state: RunState): number {
  const stageCleared = state.phase === 'reward_add' || state.phase === 'reward_edit' || state.phase === 'victory';
  return stageCleared ? state.stageIndex + 1 : state.stageIndex;
}

export function beginStage(definition: RunDefinition, state: RunState, stageIndex: number): RunState {
  const enemy = definition.stages[stageIndex];
  if (!enemy) {
    throw new Error(`run: no stage at index ${stageIndex}`);
  }
  const battle = createBattle({
    character: definition.character,
    enemy,
    reels: state.reels,
    actions: definition.actions,
    grades: definition.grades,
    startingHp: state.playerHp,
  });
  return { ...state, phase: 'battle', stageIndex, offers: null, battle };
}

/** Applies a resolved turn: keeps fighting, or moves to defeat / victory / heal + reward_add. */
export function settleBattle(definition: RunDefinition, state: RunState, battle: Battle, rng: Rng): Transition {
  const hpAfter = battle.state.playerHp;
  const stage = state.stageIndex;
  if (battle.state.phase === 'ongoing') {
    return { state: { ...state, battle }, events: [] };
  }
  if (battle.state.phase === 'defeat') {
    return { state: { ...state, phase: 'defeat', battle, playerHp: hpAfter }, events: [{ type: 'run_lost', stage }] };
  }
  const won: RunEvent = { type: 'battle_won', stage, hpAfter };
  if (stage === bossStageIndex(definition)) {
    return { state: { ...state, phase: 'victory', battle, playerHp: hpAfter }, events: [won, { type: 'run_won' }] };
  }
  const healedHp = applyHeal(hpAfter, state.maxHp, healAfter(definition, stage));
  const healed: RunEvent = { type: 'healed', amount: healedHp - hpAfter, hpAfter: healedHp };
  const reward = enterRewardAdd(definition, { ...state, playerHp: healedHp, battle: null }, rng);
  return { state: reward.state, events: [won, healed, ...reward.events] };
}

/** Next step once the add reward is resolved: the edit opportunity every N battles, else the next battle. */
export function afterRewardAdd(definition: RunDefinition, state: RunState): Transition {
  const cleared = state.stageIndex + 1;
  if (cleared % definition.rules.editEveryNBattles === 0) {
    return enterRewardEdit(definition, state);
  }
  return { state: enterNextBattle(definition, state), events: [] };
}

export function enterNextBattle(definition: RunDefinition, state: RunState): RunState {
  return beginStage(definition, state, state.stageIndex + 1);
}

function enterRewardAdd(definition: RunDefinition, state: RunState, rng: Rng): Transition {
  if (allReelsFull(state.reels, definition.rules)) {
    const next = afterRewardAdd(definition, state);
    return { state: next.state, events: [{ type: 'add_skipped' }, ...next.events] };
  }
  const offers = drawOffers(definition.rules, state.stageIndex + 1, rng);
  return { state: { ...state, phase: 'reward_add', offers }, events: [{ type: 'offers_drawn', offers }] };
}

function enterRewardEdit(definition: RunDefinition, state: RunState): Transition {
  const editable = anyDeletable(state.reels, definition.rules) || anyEnhanceable(state.reels, definition.grades);
  if (!editable) {
    return { state: enterNextBattle(definition, state), events: [{ type: 'edit_passed' }] };
  }
  return { state: { ...state, phase: 'reward_edit', offers: null }, events: [] };
}

/** The battle right before the boss heals with healBeforeBoss; earlier ones with healAfterBattle. */
function healAfter(definition: RunDefinition, stageIndex: number): HealAmount {
  const { healAfterBattle, healBeforeBoss } = definition.rules;
  return stageIndex === bossStageIndex(definition) - 1 ? healBeforeBoss : healAfterBattle;
}

function applyHeal(hp: number, maxHp: number, amount: HealAmount): number {
  return amount === 'full' ? maxHp : Math.min(maxHp, hp + amount);
}
