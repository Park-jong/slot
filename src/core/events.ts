import type { ActionId, BattleState, ReelSymbol } from './types';

/** Ordered log of what happened during a turn; the UI can animate or print these one by one. */
export type BattleEvent =
  | { readonly type: 'player_guard_expired'; readonly amount: number }
  | {
      readonly type: 'enemy_damaged';
      readonly actionId: ActionId;
      readonly damage: number;
      readonly absorbed: number;
      readonly hpLoss: number;
      readonly ignoreGuard: boolean;
      readonly enemyHp: number;
      readonly enemyGuard: number;
    }
  | {
      readonly type: 'player_guard_gained';
      readonly actionId: ActionId;
      readonly amount: number;
      readonly playerGuard: number;
    }
  | { readonly type: 'enemy_guard_expired'; readonly amount: number }
  | {
      readonly type: 'enemy_attacked';
      /** Effective damage: baseValue x the charge multiplier in effect. */
      readonly value: number;
      /** Attack value written in the enemy pattern. */
      readonly baseValue: number;
      readonly absorbed: number;
      readonly hpLoss: number;
      readonly playerHp: number;
      readonly playerGuard: number;
    }
  | { readonly type: 'enemy_guarded'; readonly value: number; readonly enemyGuard: number }
  | { readonly type: 'enemy_charged'; readonly multiplier: number }
  | { readonly type: 'victory' }
  | { readonly type: 'defeat' };

/** Result of one pure battle step: the new state plus the events it produced, in order. */
export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

/** Run-level events (M2 spec 1.3). `stage` is a stageIndex (0-based). */
export type RunEvent =
  | { readonly type: 'battle_won'; readonly stage: number; readonly hpAfter: number }
  | { readonly type: 'healed'; readonly amount: number; readonly hpAfter: number }
  | { readonly type: 'offers_drawn'; readonly offers: readonly ReelSymbol[] }
  | { readonly type: 'symbol_added'; readonly reelIndex: number; readonly symbol: ReelSymbol }
  | { readonly type: 'add_skipped' }
  | {
      readonly type: 'symbol_deleted';
      readonly reelIndex: number;
      readonly symbolIndex: number;
      readonly symbol: ReelSymbol;
    }
  | {
      readonly type: 'symbol_enhanced';
      readonly reelIndex: number;
      readonly symbolIndex: number;
      readonly from: ReelSymbol;
      readonly to: ReelSymbol;
    }
  | { readonly type: 'edit_passed' }
  | { readonly type: 'run_won' }
  | { readonly type: 'run_lost'; readonly stage: number };
