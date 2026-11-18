// Public run API (M2 spec 1): 5 battles then the boss, with add rewards, the delete/enhance
// opportunity and HP carry-over. Immutable like Battle: every call returns a new Run.
// Randomness: use ONE rng per run (createRng(seed)) for every playRunTurn/resolveRunTurn call.
// It is consumed in play order (9 per spin, then 3 for offers on a win), so seed + inputs replay a run.
// Calls in the wrong phase or with bad indices throw.
import { resolveTurn, type Battle, type TurnReport } from './battle';
import type { RunEvent } from './events';
import {
  afterRewardAdd,
  beginStage,
  clearedCount,
  enterNextBattle,
  settleBattle,
  type RunPhase,
  type RunState,
  type Transition,
} from './run-flow';
import { validateRunDefinition } from './run-validation';
import {
  anyDeletable,
  anyEnhanceable,
  appendSymbol,
  canAppendTo,
  canDeleteFrom,
  canEnhanceAt,
  deleteSymbolAt,
  enhanceSymbolAt,
} from './reel-edit';
import type { Rng } from './rng';
import { spin } from './spin';
import type { Board, ReelSymbol, RunDefinition } from './types';

export type { RunPhase, RunState } from './run-flow';

export interface Run {
  readonly definition: RunDefinition;
  readonly state: RunState;
}

export interface RunStepResult {
  readonly run: Run;
  /** Run-level events in order, including automatic skips/passes and offers drawn on entry. */
  readonly events: readonly RunEvent[];
}

export interface RunTurnResult extends RunStepResult {
  /** The battle turn that was played (board, judgement, battle events). */
  readonly report: TurnReport;
}

export interface EditOptions {
  readonly canDelete: boolean;
  readonly canEnhance: boolean;
}

/** New run at battle 0: character starting reels, full HP. Also the restart. */
export function startRun(definition: RunDefinition): Run {
  validateRunDefinition(definition);
  const initial: RunState = {
    phase: 'battle',
    stageIndex: 0,
    reels: definition.character.startingReels.map((reel) => [...reel]),
    playerHp: definition.character.maxHp,
    maxHp: definition.character.maxHp,
    offers: null,
    battle: null,
  };
  return { definition, state: beginStage(definition, initial, 0) };
}

/** Spins the current reels (9 rng calls) and resolves the turn; see resolveRunTurn. */
export function playRunTurn(run: Run, rng: Rng): RunTurnResult {
  return resolveRunTurn(run, spin(activeBattle(run).config.reels, rng), rng);
}

/** Resolves a turn from a given board. On a regular win, rng draws the offers (3 calls). */
export function resolveRunTurn(run: Run, board: Board, rng: Rng): RunTurnResult {
  const { battle, report } = resolveTurn(activeBattle(run), board);
  const settled = settleBattle(run.definition, run.state, battle, rng);
  return { ...applied(run, settled), report };
}

/** reward_add: appends offers[offerIndex] to the end of reels[reelIndex]. */
export function chooseOffer(run: Run, offerIndex: number, reelIndex: number): RunStepResult {
  assertPhase(run, 'reward_add', 'chooseOffer');
  const symbol = run.state.offers?.[offerIndex];
  if (!symbol) {
    throw new Error(`chooseOffer: offer index ${offerIndex} is out of range`);
  }
  const reels = appendSymbol(run.state.reels, reelIndex, symbol, run.definition.rules);
  const next = afterRewardAdd(run.definition, { ...run.state, reels, offers: null });
  return applied(run, next, [{ type: 'symbol_added', reelIndex, symbol }]);
}

/** reward_add: takes nothing (no compensation in M2). */
export function skipOffer(run: Run): RunStepResult {
  assertPhase(run, 'reward_add', 'skipOffer');
  const next = afterRewardAdd(run.definition, { ...run.state, offers: null });
  return applied(run, next, [{ type: 'add_skipped' }]);
}

/** reward_edit: removes one symbol (reel must stay at or above reelMin). */
export function deleteSymbol(run: Run, reelIndex: number, symbolIndex: number): RunStepResult {
  assertPhase(run, 'reward_edit', 'deleteSymbol');
  const reels = deleteSymbolAt(run.state.reels, reelIndex, symbolIndex, run.definition.rules);
  // deleteSymbolAt has validated both indices, so the symbol exists.
  const symbol = run.state.reels[reelIndex]?.[symbolIndex] as ReelSymbol;
  const event: RunEvent = { type: 'symbol_deleted', reelIndex, symbolIndex, symbol };
  return applied(run, toNextBattle(run, reels), [event]);
}

/** reward_edit: raises one symbol by one grade in place (not allowed at the top grade). */
export function enhanceSymbol(run: Run, reelIndex: number, symbolIndex: number): RunStepResult {
  assertPhase(run, 'reward_edit', 'enhanceSymbol');
  const reels = enhanceSymbolAt(run.state.reels, reelIndex, symbolIndex, run.definition.grades);
  // enhanceSymbolAt has validated both indices, so both symbols exist.
  const from = run.state.reels[reelIndex]?.[symbolIndex] as ReelSymbol;
  const to = reels[reelIndex]?.[symbolIndex] as ReelSymbol;
  const event: RunEvent = { type: 'symbol_enhanced', reelIndex, symbolIndex, from, to };
  return applied(run, toNextBattle(run, reels), [event]);
}

/** reward_edit: gives up the opportunity. */
export function passEdit(run: Run): RunStepResult {
  assertPhase(run, 'reward_edit', 'passEdit');
  return applied(run, toNextBattle(run, run.state.reels), [{ type: 'edit_passed' }]);
}

export function isRunOver(run: Run): boolean {
  return run.state.phase === 'victory' || run.state.phase === 'defeat';
}

/** Battles cleared so far; during reward_add / reward_edit this is the spec's k. */
export function battlesCleared(run: Run): number {
  return clearedCount(run.state);
}

/** Reel capacity check for chooseOffer (false at reelMax or for a bad index). */
export function canAddToReel(run: Run, reelIndex: number): boolean {
  return canAppendTo(run.state.reels, reelIndex, run.definition.rules);
}

/** Reel size check for deleteSymbol (false at reelMin or for a bad index). */
export function canDeleteFromReel(run: Run, reelIndex: number): boolean {
  return canDeleteFrom(run.state.reels, reelIndex, run.definition.rules);
}

/** Grade check for enhanceSymbol (false at the top grade or for a bad index). */
export function canEnhanceSymbol(run: Run, reelIndex: number, symbolIndex: number): boolean {
  return canEnhanceAt(run.state.reels, reelIndex, symbolIndex, run.definition.grades);
}

/** Which reward_edit choices are available; a choice is disabled when no reel/symbol allows it. */
export function editOptions(run: Run): EditOptions {
  return {
    canDelete: anyDeletable(run.state.reels, run.definition.rules),
    canEnhance: anyEnhanceable(run.state.reels, run.definition.grades),
  };
}

function activeBattle(run: Run): Battle {
  assertPhase(run, 'battle', 'run turn');
  if (!run.state.battle) {
    throw new Error('run: battle phase without a battle');
  }
  return run.state.battle;
}

function toNextBattle(run: Run, reels: RunState['reels']): Transition {
  return { state: enterNextBattle(run.definition, { ...run.state, reels }), events: [] };
}

function applied(run: Run, transition: Transition, leadingEvents: readonly RunEvent[] = []): RunStepResult {
  return {
    run: { definition: run.definition, state: transition.state },
    events: [...leadingEvents, ...transition.events],
  };
}

function assertPhase(run: Run, expected: RunPhase, caller: string): void {
  if (run.state.phase !== expected) {
    throw new Error(`${caller}: requires phase ${expected}, run is in ${run.state.phase}`);
  }
}
