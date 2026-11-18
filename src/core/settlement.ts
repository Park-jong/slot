// Turn settlement (M2.5 spec 2.3, 3, 4): pool every spin's lines, evaluate once with Focus, apply the player's
// actions, then victory check / enemy action / defeat check. stopSpinning and previewStop both call settle(),
// so a preview always equals the real result. Uses no randomness.
import { enemyAct } from './enemy';
import type { StepResult } from './events';
import { poolJudgements, type PooledJudgement } from './judge';
import { evaluateOutcomes, type ActionOutcome } from './outcome';
import { resolvePlayerActions } from './resolve';
import type { SpinningSession } from './turn-session';
import type { BattleConfig, BattleState, EnemyDef, TurnStats } from './types';

export interface Settlement {
  readonly stats: TurnStats;
  readonly spinsUsed: number;
  readonly unusedSpins: number;
  /** focusPctPerUnused x unusedSpins. */
  readonly focusPct: number;
  readonly pooled: PooledJudgement;
  /** Pooled outcomes with Focus applied, in resolution order. */
  readonly outcomes: readonly ActionOutcome[];
  /** After the player's actions. */
  readonly resolved: StepResult;
  /** After the victory check, the enemy action and the defeat check (turn advanced if still ongoing). */
  readonly finished: StepResult;
}

/** `state` is the live battle state of the spin phase (turn-start step already applied). */
export function settle(config: BattleConfig, state: BattleState, session: SpinningSession): Settlement {
  const { stats, spins } = session;
  const spinsUsed = spins.length;
  const unusedSpins = Math.max(0, stats.maxSpins - spinsUsed);
  const focusPct = stats.focusPctPerUnused * unusedSpins;
  const pooled = poolJudgements(spins);
  const outcomes = evaluateOutcomes(pooled, config.actions, { focusPct, damagePct: stats.damagePct });
  const resolved = resolvePlayerActions(state, outcomes);
  const finished = finishTurn(resolved.state, config.enemy);
  return { stats, spinsUsed, unusedSpins, focusPct, pooled, outcomes, resolved, finished };
}

/** Turn steps 6-8: a defeated enemy never acts. */
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
