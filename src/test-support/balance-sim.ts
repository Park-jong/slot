// Test-only Monte Carlo helpers shared by the quick (default) and full (opt-in) M1 balance tests.
// M1 balance numbers were measured with the M1 starting reel, the M1 enemies (= M2 slime/goblin), the M2
// tiers and one spin per turn, so the simulation keeps exactly that setup (M2.5 spec 8.6).
import { createBattle, isBattleOver, playTurn } from '../core/battle';
import { createRng } from '../core/rng';
import type { BattleConfig } from '../core/types';
import { createM2BattleConfig, M1_STARTING_REEL, type EnemyId } from '../data';

/** M1 spec section 4 table (200k-run simulation). */
export const SPEC_WIN_RATE: Readonly<Partial<Record<EnemyId, number>>> = { slime: 0.995, goblin: 0.842 };

export const BALANCE_SEED = 20261117;

/** Guards against an endless loop if a data change made a battle unwinnable for both sides. */
export const MAX_TURNS_PER_BATTLE = 200;

export function m1BalanceConfig(enemyId: EnemyId): BattleConfig {
  return { ...createM2BattleConfig(enemyId), reels: [M1_STARTING_REEL, M1_STARTING_REEL, M1_STARTING_REEL] };
}

export function simulateWinRate(enemyId: EnemyId, runs: number, seed: number): number {
  const config = m1BalanceConfig(enemyId);
  const rng = createRng(seed);
  let wins = 0;
  for (let run = 0; run < runs; run++) {
    let battle = createBattle(config);
    for (let turn = 0; !isBattleOver(battle); turn++) {
      if (turn >= MAX_TURNS_PER_BATTLE) {
        throw new Error(`simulateWinRate: ${enemyId} battle exceeded ${MAX_TURNS_PER_BATTLE} turns`);
      }
      battle = playTurn(battle, rng).battle;
    }
    if (battle.state.phase === 'victory') wins++;
  }
  return wins / runs;
}

export function specWinRateEntries(): [EnemyId, number][] {
  return Object.entries(SPEC_WIN_RATE) as [EnemyId, number][];
}
