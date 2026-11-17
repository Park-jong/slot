import { enemyAct, intentAt } from './enemy';
import type { BattleEvent, StepResult } from './events';
import { judge, type JudgeResult } from './judge';
import { evaluateAction, IMPLEMENTED_EFFECT_IDS, type ActionOutcome } from './outcome';
import { resolvePlayerActions, startTurn } from './resolve';
import type { Rng } from './rng';
import { spin } from './spin';
import type { ActionDef, BattleConfig, BattleState, Board, EnemyDef, Intent } from './types';

/** Immutable battle value: every turn function returns a new Battle and never mutates its input. */
export interface Battle {
  readonly config: BattleConfig;
  readonly state: BattleState;
}

export interface TurnReport {
  /** Turn number this report describes (before.turn). */
  readonly turn: number;
  /** Enemy intent shown during this turn (what the enemy does at step 7 unless it is defeated first). */
  readonly intent: Intent;
  readonly board: Board;
  readonly judgement: JudgeResult;
  /** Computed values per fired action, in resolution order. */
  readonly outcomes: readonly ActionOutcome[];
  readonly events: readonly BattleEvent[];
  readonly before: BattleState;
  readonly after: BattleState;
}

export interface TurnResult {
  readonly battle: Battle;
  readonly report: TurnReport;
}

export function createBattle(config: BattleConfig): Battle {
  return createBattleFromState(config, {
    turn: 1,
    playerHp: config.character.maxHp,
    playerGuard: 0,
    enemyHp: config.enemy.hp,
    enemyGuard: 0,
    enemyActionIndex: 0,
    phase: 'ongoing',
  });
}

/** Starts from an explicit mid-battle state (tests, debugging, future save/load). */
export function createBattleFromState(config: BattleConfig, state: BattleState): Battle {
  validateConfig(config);
  return { config, state };
}

export function currentIntent(battle: Battle): Intent {
  return intentAt(battle.config.enemy, battle.state.enemyActionIndex);
}

export function isBattleOver(battle: Battle): boolean {
  return battle.state.phase !== 'ongoing';
}

/** Spin, judge and resolve in one call. */
export function playTurn(battle: Battle, rng: Rng): TurnResult {
  return resolveTurn(battle, spin(battle.config.reels, rng));
}

/**
 * Resolves a full turn from an already spun (and possibly manipulated) board: turn start,
 * judge, player actions, victory check, enemy action, defeat check. Throws once the battle is over.
 */
export function resolveTurn(battle: Battle, board: Board): TurnResult {
  if (isBattleOver(battle)) {
    throw new Error(`resolveTurn: battle already ended (${battle.state.phase})`);
  }
  const { config, state: before } = battle;
  const intent = currentIntent(battle);
  const started = startTurn(before);
  const judgement = judge(board, config.grades);
  const outcomes = evaluateOutcomes(judgement, config.actions);
  const resolved = resolvePlayerActions(started.state, outcomes);
  const finished = finishTurn(resolved.state, config.enemy);
  const after = finished.state;
  return {
    battle: { config, state: after },
    report: {
      turn: before.turn,
      intent,
      board,
      judgement,
      outcomes,
      events: [...started.events, ...resolved.events, ...finished.events],
      before,
      after,
    },
  };
}

/** Outcomes for every fired action, ordered by the config's action (resolution) order. */
export function evaluateOutcomes(judgement: JudgeResult, actions: readonly ActionDef[]): ActionOutcome[] {
  const unknown = Object.keys(judgement.byAction).filter((id) => !actions.some((action) => action.id === id));
  if (unknown.length > 0) {
    throw new Error(`evaluateOutcomes: board contains unknown actions ${unknown.join(', ')}`);
  }
  return actions.flatMap((action) => {
    const tally = judgement.byAction[action.id];
    return tally ? [evaluateAction(action, tally)] : [];
  });
}

/** Steps 6-8: a defeated enemy never acts. */
function finishTurn(state: BattleState, enemy: EnemyDef): StepResult {
  if (state.enemyHp <= 0) {
    return { state: { ...state, phase: 'victory' }, events: [{ type: 'victory' }] };
  }
  const acted = enemyAct(state, enemy);
  if (acted.state.playerHp <= 0) {
    return { state: { ...acted.state, phase: 'defeat' }, events: [...acted.events, { type: 'defeat' }] };
  }
  return { state: { ...acted.state, turn: acted.state.turn + 1 }, events: acted.events };
}

function validateConfig(config: BattleConfig): void {
  if (config.enemy.pattern.length === 0) {
    throw new Error(`config: enemy ${config.enemy.id} has an empty pattern`);
  }
  for (const action of config.actions) {
    if (action.tiers.length === 0) {
      throw new Error(`config: action ${action.id} has no tiers`);
    }
    const unsupported = action.effects.find(
      (effect) => !effect.deferred && !IMPLEMENTED_EFFECT_IDS.includes(effect.id),
    );
    if (unsupported) {
      throw new Error(`config: effect ${unsupported.id} on ${action.id} is not implemented; mark it deferred`);
    }
  }
  for (const symbol of config.reels.flat()) {
    if (!config.actions.some((action) => action.id === symbol.actionId)) {
      throw new Error(`config: reel symbol uses unknown action ${symbol.actionId}`);
    }
    if (!config.grades[symbol.grade]) {
      throw new Error(`config: reel symbol uses unknown grade ${symbol.grade}`);
    }
  }
}
