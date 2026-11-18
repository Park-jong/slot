// Public API of the rules engine. Pure TypeScript, no DOM. Internal helpers (spin, judge, enemy steps,
// reel edits, offer drawing) stay module-private; core unit tests import them from their modules.
export type * from './types';
export type { BattleEvent, RunEvent } from './events';
export type { Cell, LineId } from './lines';
export type { ActionJudgement, FiredLine, JudgeResult } from './judge';
export type { ActionOutcome } from './outcome';
export type { IntentPreview } from './enemy';

export { createRng, type Rng } from './rng';
export { GRID_SIZE } from './lines';
export { MULTIPLIER_DENOMINATOR } from './outcome';
export { activeEffects, EFFECT_IGNORE_GUARD } from './effects';
export {
  createBattle,
  createBattleFromState,
  currentIntent,
  currentIntentPreview,
  isBattleOver,
  playTurn,
  resolveTurn,
  type Battle,
  type TurnReport,
  type TurnResult,
} from './battle';
export {
  battlesCleared,
  canAddToReel,
  canDeleteFromReel,
  canEnhanceSymbol,
  chooseOffer,
  deleteSymbol,
  editOptions,
  enhanceSymbol,
  isRunOver,
  passEdit,
  playRunTurn,
  skipOffer,
  startRun,
  type EditOptions,
  type Run,
  type RunPhase,
  type RunState,
  type RunStepResult,
  type RunTurnResult,
} from './run';
export { bossStageIndex } from './run-flow';
export * from './reel-analysis';
