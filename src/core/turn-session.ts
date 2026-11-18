// Turn progress of a battle (M2.5 spec 2.1): turn_start -> spinning(1..maxSpins-1) -> resolved. Pure values
// plus the legality checks of spec 2.2/2.4; the transitions themselves live in battle.ts.
import { judge, type JudgeResult } from './judge';
import type { BattleState, Board, GradeTable, TurnStats } from './types';

/** One spin of the current turn: its board and the lines that fired on it. */
export interface SpinRecord {
  /** 1-based spin number within the turn. */
  readonly index: number;
  readonly board: Board;
  readonly judgement: JudgeResult;
}

export interface TurnStartSession {
  readonly kind: 'turn_start';
  readonly stats: TurnStats;
}

export interface SpinningSession {
  readonly kind: 'spinning';
  readonly stats: TurnStats;
  /** spins.length = spinsUsed; on a Battle always 1 <= spinsUsed < stats.maxSpins (max auto-resolves). */
  readonly spins: readonly SpinRecord[];
  /** Battle state before the turn-start step (player guard not yet expired); becomes the report's `before`. */
  readonly turnStart: BattleState;
}

export type TurnSession = TurnStartSession | SpinningSession;

/** State names used in error messages (spec 2.4). */
type SessionLabel = TurnSession['kind'] | 'battle ended';

export function sessionLabel(session: TurnSession | null): SessionLabel {
  return session ? session.kind : 'battle ended';
}

/** Spinning session with one more judged board. */
export function withSpin(session: SpinningSession, board: Board, grades: GradeTable): SpinningSession {
  const record: SpinRecord = { index: session.spins.length + 1, board, judgement: judge(board, grades) };
  return { ...session, spins: [...session.spins, record] };
}

/** Throws when the battle is over; returns the live session. */
export function requireActiveSession(session: TurnSession | null, state: BattleState, caller: string): TurnSession {
  if (!session) {
    throw new Error(`${caller}: battle already ended (${state.phase})`);
  }
  return session;
}

export function requireSpinning(session: TurnSession | null, state: BattleState, caller: string): SpinningSession {
  const active = requireActiveSession(session, state, caller);
  if (active.kind !== 'spinning') {
    throw new Error(`${caller}: not allowed in state ${active.kind} (no spin yet this turn)`);
  }
  return active;
}

export function requireTurnStart(session: TurnSession | null, state: BattleState, caller: string): TurnStartSession {
  const active = requireActiveSession(session, state, caller);
  if (active.kind !== 'turn_start') {
    throw new Error(`${caller}: not allowed in state ${active.kind} (turn in progress)`);
  }
  return active;
}

/** Input checks of createBattleFromState (spec 2.4). */
export function validateSession(state: BattleState, session: TurnSession | null): void {
  const ended = state.phase !== 'ongoing';
  if (ended !== (session === null)) {
    throw new Error(`battle: session ${sessionLabel(session)} does not match battle phase ${state.phase}`);
  }
  if (!session) {
    return;
  }
  validateStats(session.stats);
  if (session.kind === 'spinning') {
    validateSpins(session, state);
  }
}

function validateStats({ maxSpins, focusPctPerUnused, damagePct }: TurnStats): void {
  if (!Number.isInteger(maxSpins) || maxSpins < 1) {
    throw new Error(`battle: session maxSpins ${maxSpins} must be a positive integer`);
  }
  if (!Number.isInteger(focusPctPerUnused) || focusPctPerUnused < 0 || !Number.isInteger(damagePct)) {
    throw new Error(`battle: session focus ${focusPctPerUnused} / damagePct ${damagePct} must be integers (focus >= 0)`);
  }
}

function validateSpins({ spins, stats, turnStart }: SpinningSession, state: BattleState): void {
  if (spins.length < 1 || spins.length >= stats.maxSpins) {
    throw new Error(`battle: spinning session has ${spins.length} spins, allowed 1..${stats.maxSpins - 1}`);
  }
  const outOfOrder = spins.findIndex((spin, position) => spin.index !== position + 1);
  if (outOfOrder !== -1) {
    throw new Error(`battle: spin indices must run 1..${spins.length} in order (position ${outOfOrder + 1})`);
  }
  if (turnStart.turn !== state.turn) {
    throw new Error(`battle: spinning session started on turn ${turnStart.turn}, battle is on turn ${state.turn}`);
  }
}
