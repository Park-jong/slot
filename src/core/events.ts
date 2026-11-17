import type { ActionId, BattleState } from './types';

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
      readonly value: number;
      readonly absorbed: number;
      readonly hpLoss: number;
      readonly playerHp: number;
      readonly playerGuard: number;
    }
  | { readonly type: 'enemy_guarded'; readonly value: number; readonly enemyGuard: number }
  | { readonly type: 'victory' }
  | { readonly type: 'defeat' };

/** Result of one pure battle step: the new state plus the events it produced, in order. */
export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
