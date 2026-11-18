import { validateBattleConfig } from './config-validation';
import { enemyAct, intentAt, intentPreview, UNCHARGED_MULTIPLIER, type IntentPreview } from './enemy';
import type { BattleEvent, StepResult } from './events';
import { judge, type JudgeResult } from './judge';
import { evaluateOutcomes, type ActionOutcome } from './outcome';
import { resolvePlayerActions, startTurn } from './resolve';
import type { Rng } from './rng';
import { spin } from './spin';
import type { BattleConfig, BattleState, Board, EnemyDef, Intent } from './types';

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
    playerHp: config.startingHp ?? config.character.maxHp,
    playerGuard: 0,
    enemyHp: config.enemy.hp,
    enemyGuard: 0,
    enemyActionIndex: 0,
    enemyChargeMult: UNCHARGED_MULTIPLIER,
    phase: 'ongoing',
  });
}

/** Starts from an explicit mid-battle state (tests, debugging, future save/load). */
export function createBattleFromState(config: BattleConfig, state: BattleState): Battle {
  validateBattleConfig(config);
  return { config, state };
}

export function currentIntent(battle: Battle): Intent {
  return intentAt(battle.config.enemy, battle.state.enemyActionIndex);
}

/** Current intent as the UI shows it: effective values after a charge, plus the boosted next intent. */
export function currentIntentPreview(battle: Battle): IntentPreview {
  return intentPreview(battle.state, battle.config.enemy);
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
