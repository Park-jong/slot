// Public battle API (M1 spec 2, M2.5 spec 2). A turn is a spin phase (spinOnce/submitSpin up to maxSpins,
// stopSpinning) followed by one settlement. Immutable: every call returns a new Battle and never mutates its
// input, so a throwing call leaves the caller's Battle untouched. Randomness: spinOnce draws exactly 9 rng
// values; nothing else in a turn uses rng.
import { validateBattleConfig, validateBoard } from './config-validation';
import { incomingDamage, intentAt, intentPreview, UNCHARGED_MULTIPLIER, type IntentPreview } from './enemy';
import type { BattleEvent, SpinPhaseEvent, StopReason, TurnEvent } from './events';
import type { JudgeResult, PooledJudgement } from './judge';
import type { ActionOutcome } from './outcome';
import { startTurn } from './resolve';
import type { Rng } from './rng';
import { settle } from './settlement';
import { spin } from './spin';
import { buildStopPreview, type StopPreview } from './stop-preview';
import {
  requireActiveSession,
  requireSpinning,
  requireTurnStart,
  validateSession,
  withSpin,
  type SpinningSession,
  type SpinRecord,
  type TurnSession,
} from './turn-session';
import { turnStatsOf } from './turn-stats';
import type { BattleConfig, BattleState, Board, Intent, TurnStats } from './types';

export type { SpinRecord, TurnSession } from './turn-session';

export interface Battle {
  readonly config: BattleConfig;
  readonly state: BattleState;
  /** Turn progress; null once the battle has ended. */
  readonly session: TurnSession | null;
}

/** The parts of a Battle that intent and end checks read (also satisfied by a report's config + state). */
export type BattleView = Pick<Battle, 'config' | 'state'>;

/** One spin as reported to the caller. */
export interface SpinReport {
  readonly index: number;
  readonly maxSpins: number;
  readonly board: Board;
  /** Lines fired on this spin alone. */
  readonly judgement: JudgeResult;
  /** No line fired on this spin. */
  readonly empty: boolean;
}

export interface SpinResult {
  readonly battle: Battle;
  readonly spin: SpinReport;
  /** Set only when this spin reached maxSpins and the turn resolved in the same call. */
  readonly result: TurnResult | null;
  /** Events of this call, in order (turn start, spun, and on auto-resolve the settlement events). */
  readonly events: readonly TurnEvent[];
}

/** true = spin again, false = stop now. */
export type StopPolicy = (preview: StopPreview, battle: Battle) => boolean;

export interface TurnReport {
  /** Turn number this report describes (before.turn). */
  readonly turn: number;
  /** Enemy intent shown during this turn (what the enemy does unless it is defeated first). */
  readonly intent: Intent;
  /** Board of the last spin (compatibility; see spins). */
  readonly board: Board;
  /** Pooled lines of every spin (same shape as a single-board judgement; equal to it for one spin). */
  readonly judgement: JudgeResult;
  /** Computed values per fired action (pooled, Focus applied), in resolution order. */
  readonly outcomes: readonly ActionOutcome[];
  /** Battle events as in M1/M2: player guard expiry, then the settlement. Spin-phase events: turnEvents. */
  readonly events: readonly BattleEvent[];
  /** State at turn start, before the player's guard expired. */
  readonly before: BattleState;
  readonly after: BattleState;
  readonly spins: readonly SpinReport[];
  readonly pooled: PooledJudgement;
  readonly maxSpins: number;
  readonly spinsUsed: number;
  readonly unusedSpins: number;
  /** Focus percent applied (focusPctPerUnused x unusedSpins). */
  readonly focusPct: number;
  readonly damagePct: number;
  readonly stopReason: StopReason;
  /** No line fired in any spin (equivalent to outcomes.length === 0). */
  readonly empty: boolean;
  /** Full turn log: turn_started, player_guard_expired?, spun..., spin_phase_ended, settlement events. */
  readonly turnEvents: readonly TurnEvent[];
}

export interface TurnResult {
  readonly battle: Battle;
  readonly report: TurnReport;
}

/** Spin phase after the turn-start step, before the next spin is added. */
interface OpenTurn {
  readonly state: BattleState;
  readonly session: SpinningSession;
  readonly events: readonly TurnEvent[];
}

interface ClosedTurn {
  readonly result: TurnResult;
  /** spin_phase_ended and the settlement events. */
  readonly events: readonly TurnEvent[];
}

const NO_SPIN_AGAIN: StopPolicy = () => false;

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

/**
 * Starts from an explicit state (tests, debugging, future save/load). Without a session an ongoing battle
 * starts a fresh turn (stats from the config) and an ended one gets null. A given session is kept as is,
 * stats included (spec 5.1: stats only change at the next turn start).
 */
export function createBattleFromState(config: BattleConfig, state: BattleState, session?: TurnSession | null): Battle {
  validateBattleConfig(config);
  const resolved = session === undefined ? freshSession(config, state) : session;
  validateSession(state, resolved);
  return { config, state, session: resolved };
}

export function currentIntent(battle: BattleView): Intent {
  return intentAt(battle.config.enemy, battle.state.enemyActionIndex);
}

/** Current intent as the UI shows it: effective values after a charge, plus the boosted next intent. */
export function currentIntentPreview(battle: BattleView): IntentPreview {
  return intentPreview(battle.state, battle.config.enemy);
}

export function isBattleOver(battle: BattleView): boolean {
  return battle.state.phase !== 'ongoing';
}

/** Draws a board (9 rng calls) and adds it as the next spin; see submitSpin. */
export function spinOnce(battle: Battle, rng: Rng): SpinResult {
  const session = requireActiveSession(battle.session, battle.state, 'spinOnce');
  return addSpin(battle, session, spin(battle.config.reels, rng));
}

/**
 * Adds a given board as the next spin (no rng). Spin 1 runs the turn-start step first. Reaching maxSpins
 * resolves the turn in the same call (`result` set, stopReason max_reached).
 */
export function submitSpin(battle: Battle, board: Board): SpinResult {
  const session = requireActiveSession(battle.session, battle.state, 'submitSpin');
  validateBoard(board, battle.config, 'submitSpin');
  return addSpin(battle, session, board);
}

/** Ends the spin phase and resolves the turn (no rng). Requires at least one spin this turn. */
export function stopSpinning(battle: Battle): TurnResult {
  const session = requireSpinning(battle.session, battle.state, 'stopSpinning');
  return closeTurn(battle.config, battle.state, session, 'player_stop').result;
}

/** What stopSpinning would produce right now; pure, same computation as stopSpinning. */
export function previewStop(battle: Battle): StopPreview {
  const session = requireSpinning(battle.session, battle.state, 'previewStop');
  return previewOf(battle, session);
}

/** One whole turn: spin, then spin again while the policy says so. Default: stop after one spin. */
export function playTurn(battle: Battle, rng: Rng, policy: StopPolicy = NO_SPIN_AGAIN): TurnResult {
  requireTurnStart(battle.session, battle.state, 'playTurn');
  let step = spinOnce(battle, rng);
  while (!step.result) {
    if (!policy(previewStop(step.battle), step.battle)) {
      return stopSpinning(step.battle);
    }
    step = spinOnce(step.battle, rng);
  }
  return step.result;
}

/**
 * One whole turn from one board: spin once, then stop (unused spins count for Focus). With an effective
 * max of 1 this is exactly the M2 turn.
 */
export function resolveTurn(battle: Battle, board: Board): TurnResult {
  requireTurnStart(battle.session, battle.state, 'resolveTurn');
  const step = submitSpin(battle, board);
  return step.result ?? stopSpinning(step.battle);
}

/** Stop preview of a spinning session (shared with the continue estimate). */
export function previewOf(battle: BattleView, session: SpinningSession): StopPreview {
  const { config, state } = battle;
  return buildStopPreview(settle(config, state, session), config.actions, incomingDamage(state, config.enemy));
}

function freshSession(config: BattleConfig, state: BattleState): TurnSession | null {
  return state.phase === 'ongoing' ? { kind: 'turn_start', stats: turnStatsOf(config) } : null;
}

function addSpin(battle: Battle, session: TurnSession, board: Board): SpinResult {
  const { config } = battle;
  const open = session.kind === 'turn_start' ? openTurn(battle.state, session.stats) : continueTurn(battle.state, session);
  const spinning = withSpin(open.session, board, config.grades);
  const { maxSpins } = spinning.stats;
  const spinReport = toSpinReport(lastSpin(spinning), maxSpins);
  const events = [...open.events, spunEvent(spinReport)];
  if (spinning.spins.length < maxSpins) {
    return { battle: { config, state: open.state, session: spinning }, spin: spinReport, result: null, events };
  }
  const closed = closeTurn(config, open.state, spinning, 'max_reached');
  return { battle: closed.result.battle, spin: spinReport, result: closed.result, events: [...events, ...closed.events] };
}

function openTurn(turnStart: BattleState, stats: TurnStats): OpenTurn {
  const started = startTurn(turnStart);
  return {
    state: started.state,
    session: { kind: 'spinning', stats, spins: [], turnStart },
    events: openingEvents(turnStart, stats),
  };
}

function continueTurn(state: BattleState, session: SpinningSession): OpenTurn {
  return { state, session, events: [] };
}

/** Settles the turn and starts the next one (stats recomputed from the config) unless the battle ended. */
function closeTurn(config: BattleConfig, state: BattleState, session: SpinningSession, reason: StopReason): ClosedTurn {
  const settlement = settle(config, state, session);
  const { stats, spinsUsed, unusedSpins, focusPct, pooled, outcomes, resolved, finished } = settlement;
  const { turnStart } = session;
  const after = finished.state;
  const phaseEnded: SpinPhaseEvent = { type: 'spin_phase_ended', spinsUsed, unusedSpins, focusPct, reason };
  const settlementEvents = [...resolved.events, ...finished.events];
  const spins = session.spins.map((record) => toSpinReport(record, stats.maxSpins));
  const report: TurnReport = {
    turn: turnStart.turn,
    intent: intentAt(config.enemy, turnStart.enemyActionIndex),
    board: lastSpin(session).board,
    judgement: pooled,
    outcomes,
    events: [...startTurn(turnStart).events, ...settlementEvents],
    before: turnStart,
    after,
    spins,
    pooled,
    maxSpins: stats.maxSpins,
    spinsUsed,
    unusedSpins,
    focusPct,
    damagePct: stats.damagePct,
    stopReason: reason,
    empty: outcomes.length === 0,
    turnEvents: [...openingEvents(turnStart, stats), ...spins.map(spunEvent), phaseEnded, ...settlementEvents],
  };
  const battle: Battle = { config, state: after, session: freshSession(config, after) };
  return { result: { battle, report }, events: [phaseEnded, ...settlementEvents] };
}

/** turn_started, then the turn-start step's events (player guard expiry). */
function openingEvents(turnStart: BattleState, stats: TurnStats): TurnEvent[] {
  const started: SpinPhaseEvent = {
    type: 'turn_started',
    turn: turnStart.turn,
    maxSpins: stats.maxSpins,
    focusPctPerUnused: stats.focusPctPerUnused,
    damagePct: stats.damagePct,
  };
  return [started, ...startTurn(turnStart).events];
}

function toSpinReport(record: SpinRecord, maxSpins: number): SpinReport {
  const { index, board, judgement } = record;
  return { index, maxSpins, board, judgement, empty: judgement.firedLines.length === 0 };
}

function spunEvent(report: SpinReport): SpinPhaseEvent {
  return {
    type: 'spun',
    spinIndex: report.index,
    maxSpins: report.maxSpins,
    firedLines: report.judgement.firedLines.map(({ lineId, actionId, gradeSum }) => ({ lineId, actionId, gradeSum })),
    empty: report.empty,
  };
}

function lastSpin(session: SpinningSession): SpinRecord {
  const record = session.spins.at(-1);
  if (!record) {
    throw new Error('battle: spinning session without a spin');
  }
  return record;
}
