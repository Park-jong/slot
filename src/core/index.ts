// Public API of the rules engine. Pure TypeScript, no DOM. Internal helpers (spin, judge, enemy steps,
// reel edits, offer drawing) stay module-private; core unit tests import them from their modules.
export type * from './types';
export type { BattleEvent, RunEvent, SpinPhaseEvent, SpunLine, StopReason, TurnEvent } from './events';
export type { Cell, LineId } from './lines';
export type { ActionJudgement, FiredLine, JudgeResult, PooledFiredLine, PooledJudgement } from './judge';
export type { ActionOutcome } from './outcome';
export type { IntentPreview } from './enemy';
export type { EffectThreshold, StopPreview, StopPreviewAction } from './stop-preview';

export { createRng, type Rng } from './rng';
export { GRID_SIZE } from './lines';
export { MULTIPLIER_DENOMINATOR, PERCENT_BASE } from './outcome';
export { activeEffects, EFFECT_IGNORE_GUARD } from './effects';
export { resolveTurnStats } from './turn-stats';
export {
  createBattle,
  createBattleFromState,
  currentIntent,
  currentIntentPreview,
  isBattleOver,
  playTurn,
  previewStop,
  resolveTurn,
  spinOnce,
  stopSpinning,
  submitSpin,
  type Battle,
  type BattleView,
  type SpinRecord,
  type SpinReport,
  type SpinResult,
  type StopPolicy,
  type TurnReport,
  type TurnResult,
  type TurnSession,
} from './battle';
export { estimateContinue, type ContinueEstimate, type ContinueEstimateOptions } from './continue-estimate';
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
  resolveRunTurn,
  skipOffer,
  spinRun,
  startRun,
  stopRun,
  type EditOptions,
  type Run,
  type RunPhase,
  type RunSpinResult,
  type RunState,
  type RunStepResult,
  type RunTurnResult,
} from './run';
export { bossStageIndex } from './run-flow';
export * from './reel-analysis';
