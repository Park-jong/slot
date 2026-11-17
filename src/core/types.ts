// Shared definitions for game data (src/data) and battle state. All game numbers live in data;
// these types only describe their shape.

export type ActionId = string;
export type GradeId = number;
export type EffectId = string;

export interface GradeDef {
  readonly id: GradeId;
  readonly name: string;
  readonly value: number;
}

export type GradeTable = Readonly<Record<GradeId, GradeDef>>;

export interface ReelSymbol {
  readonly actionId: ActionId;
  readonly grade: GradeId;
}

export type Reel = readonly ReelSymbol[];

/** board[reel][row], reel and row both 0..2, row 0 is the top row. */
export type Board = readonly (readonly ReelSymbol[])[];

/** Multiplier is multiplierNum / MULTIPLIER_DENOMINATOR (integer math, see core/outcome.ts). */
export interface TierDef {
  readonly lineCount: number;
  readonly multiplierNum: number;
}

/** Effects flagged `deferred` are listed for later milestones and ignored by the engine. */
export interface EffectDef {
  readonly id: EffectId;
  readonly minLines: number;
  readonly params: Readonly<Record<string, number>>;
  readonly deferred: boolean;
}

/** Per grade-sum output. Zero means the action does not produce that output. */
export interface BasePower {
  readonly damage: number;
  readonly guard: number;
}

export interface ActionDef {
  readonly id: ActionId;
  readonly name: string;
  readonly basePower: BasePower;
  /** Any order; the tier with the highest lineCount <= line count applies (see selectTier). */
  readonly tiers: readonly TierDef[];
  readonly effects: readonly EffectDef[];
}

export type IntentType = 'attack' | 'guard';

export interface Intent {
  readonly type: IntentType;
  readonly value: number;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly pattern: readonly Intent[];
}

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  readonly skillActionId: ActionId;
  readonly startingReels: readonly Reel[];
}

export interface BattleConfig {
  readonly character: CharacterDef;
  readonly enemy: EnemyDef;
  /** Reels used for spinning; separate from the character so reel-building can change them. */
  readonly reels: readonly Reel[];
  /** Array order is the resolution order within a turn (guard -> shield_bash -> attack in M1). */
  readonly actions: readonly ActionDef[];
  readonly grades: GradeTable;
}

export type BattlePhase = 'ongoing' | 'victory' | 'defeat';

export interface BattleState {
  readonly turn: number;
  readonly playerHp: number;
  readonly playerGuard: number;
  /** May go negative on overkill; clamp with max(0, hp) only for display. */
  readonly enemyHp: number;
  readonly enemyGuard: number;
  readonly enemyActionIndex: number;
  readonly phase: BattlePhase;
}
