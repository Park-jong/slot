// Test-only helpers that drive a run to a chosen battle result without playing random battles.
import { createBattleFromState } from '../core/battle';
import type { Rng } from '../core/rng';
import { resolveRunTurn, type Run, type RunTurnResult } from '../core/run';
import type { BattleState, RunDefinition } from '../core/types';
import { M2_RUN } from '../data';
import { EMPTY_BOARD, reelFromNotation, SINGLE_ATTACK_BOARD } from './test-helpers';

/** HP an enemy is left with so the single-attack board (6 damage) kills it before it acts. */
const NEARLY_DEAD_ENEMY_HP = 1;
/** Player HP that any enemy attack (value >= 1) reduces to 0. */
const NEARLY_DEAD_PLAYER_HP = 1;

/** M2 run whose character starts with the given reels, e.g. ['A1 A1 A1', ...]. */
export function definitionWithReels(reelNotations: readonly string[]): RunDefinition {
  return {
    ...M2_RUN,
    character: { ...M2_RUN.character, startingReels: reelNotations.map(reelFromNotation) },
  };
}

/** Replaces fields of the current battle state (run must be in the battle phase). */
export function withBattleState(run: Run, overrides: Partial<BattleState>): Run {
  const battle = run.state.battle;
  if (run.state.phase !== 'battle' || !battle) {
    throw new Error(`withBattleState: run is in ${run.state.phase}`);
  }
  const forced = createBattleFromState(battle.config, { ...battle.state, ...overrides });
  return { ...run, state: { ...run.state, battle: forced } };
}

/** Ends the current battle as a win with the player at hpAfter (the enemy dies before acting). */
export function winBattle(run: Run, hpAfter: number, rng: Rng): RunTurnResult {
  const nearlyWon = withBattleState(run, { playerHp: hpAfter, enemyHp: NEARLY_DEAD_ENEMY_HP, enemyGuard: 0 });
  return resolveRunTurn(nearlyWon, SINGLE_ATTACK_BOARD, rng);
}

/** Ends the current battle as a loss: an empty turn against the enemy's first attack intent. */
export function loseBattle(run: Run, rng: Rng): RunTurnResult {
  const pattern = run.state.battle?.config.enemy.pattern ?? [];
  const attackIndex = pattern.findIndex((intent) => intent.type === 'attack');
  if (attackIndex === -1) {
    throw new Error('loseBattle: enemy has no attack intent');
  }
  const nearlyLost = withBattleState(run, {
    playerHp: NEARLY_DEAD_PLAYER_HP,
    playerGuard: 0,
    enemyActionIndex: attackIndex,
  });
  return resolveRunTurn(nearlyLost, EMPTY_BOARD, rng);
}

export function symbolCount(run: Run): number {
  return run.state.reels.reduce((sum, reel) => sum + reel.length, 0);
}

export function reelSizes(run: Run): number[] {
  return run.state.reels.map((reel) => reel.length);
}
