import type { LineId } from './lines';
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

/** Why the spin phase of a turn ended (M2.5 spec 2.5). */
export type StopReason = 'player_stop' | 'max_reached';

/** A fired line as reported by the `spun` event. */
export interface SpunLine {
  readonly lineId: LineId;
  readonly actionId: ActionId;
  readonly gradeSum: number;
}

/**
 * Spin-phase events of a multi-spin turn (M2.5 spec 2.5). Kept apart from BattleEvent so code that handles
 * only the resolution log (BattleEvent, as in M1/M2) stays valid; TurnEvent is the full turn log.
 */
export type SpinPhaseEvent =
  | {
      readonly type: 'turn_started';
      readonly turn: number;
      readonly maxSpins: number;
      readonly focusPctPerUnused: number;
      readonly damagePct: number;
    }
  | {
      readonly type: 'spun';
      readonly spinIndex: number;
      readonly maxSpins: number;
      readonly firedLines: readonly SpunLine[];
      /** No line fired in this spin. */
      readonly empty: boolean;
    }
  | {
      readonly type: 'spin_phase_ended';
      readonly spinsUsed: number;
      readonly unusedSpins: number;
      readonly focusPct: number;
      readonly reason: StopReason;
    };

/** Full turn log order: turn_started, player_guard_expired?, spun..., spin_phase_ended, resolution events. */
export type TurnEvent = SpinPhaseEvent | BattleEvent;

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
