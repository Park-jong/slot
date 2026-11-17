// Test-only Monte Carlo helpers shared by the quick (default) and full (opt-in) balance tests.
import { createM1BattleConfig, type EnemyId } from '../data';
import { createBattle, isBattleOver, playTurn } from './battle';
import { createRng } from './rng';

/** Spec section 4 table (200k-run simulation). */
export const SPEC_WIN_RATE: Readonly<Record<EnemyId, number>> = { slime: 0.995, goblin: 0.842 };

export const BALANCE_SEED = 20261117;

export function simulateWinRate(enemyId: EnemyId, runs: number, seed: number): number {
  const config = createM1BattleConfig(enemyId);
  const rng = createRng(seed);
  let wins = 0;
  for (let run = 0; run < runs; run++) {
    let battle = createBattle(config);
    while (!isBattleOver(battle)) battle = playTurn(battle, rng).battle;
    if (battle.state.phase === 'victory') wins++;
  }
  return wins / runs;
}

export function specWinRateEntries(): [EnemyId, number][] {
  return Object.entries(SPEC_WIN_RATE) as [EnemyId, number][];
}
