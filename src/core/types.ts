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

export type IntentType = 'attack' | 'guard' | 'charge';

/** For `charge`, value is the multiplier applied to the enemy's next attack (integer >= 2). */
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
  /** Base max spins per turn before modifiers (M2.5 spec 5.1); integer within the turn rules' bounds. */
  readonly spinsPerTurn: number;
}

/** Turn-rule numbers shared by battles and runs (M2.5 spec 5.1). */
export interface TurnRules {
  /** Focus percent added to damage and guard per unused spin. */
  readonly focusPercentPerUnusedSpin: number;
  /** Clamp bounds of the effective max spins. */
  readonly spinsPerTurnMin: number;
  readonly spinsPerTurnHardCap: number;
}

/** Item-style turn modifier (data hook for M4). Every field is an optional integer; omitted = no change. */
export interface TurnModifier {
  readonly id: string;
  /** Added to the base spins (may be negative). */
  readonly spinsPerTurnAdd?: number;
  /** Integer percent applied to the spins (100 = unchanged); several multiply with a floor at each step. */
  readonly spinsPerTurnMulPct?: number;
  /** Added to the damage percent only (never guard). */
  readonly damagePct?: number;
  /** Added to focusPercentPerUnusedSpin. */
  readonly focusPctAdd?: number;
}

/** Turn numbers fixed at turn start (M2.5 spec 5.1); they never change during the spin phase. */
export interface TurnStats {
  readonly maxSpins: number;
  readonly focusPctPerUnused: number;
  readonly damagePct: number;
}

export interface BattleConfig {
  readonly character: CharacterDef;
  readonly enemy: EnemyDef;
  /** Reels used for spinning; separate from the character so reel-building can change them. */
  readonly reels: readonly Reel[];
  /** Array order is the resolution order within a turn (guard -> shield_bash -> attack in M1). */
  readonly actions: readonly ActionDef[];
  readonly grades: GradeTable;
  /** Player HP at battle start (HP carried over in a run). Defaults to character.maxHp. */
  readonly startingHp?: number;
  readonly turnRules: TurnRules;
  /** Turn modifiers in force (items); omitted = none. Read at every turn start. */
  readonly modifiers?: readonly TurnModifier[];
}

export type BattlePhase = 'ongoing' | 'victory' | 'defeat';

export type EndPhase = Exclude<BattlePhase, 'ongoing'>;

export interface BattleState {
  readonly turn: number;
  /** May go negative on the killing blow; clamp with max(0, hp) only for display. */
  readonly playerHp: number;
  readonly playerGuard: number;
  /** May go negative on overkill; clamp with max(0, hp) only for display. */
  readonly enemyHp: number;
  readonly enemyGuard: number;
  readonly enemyActionIndex: number;
  /** Multiplier for the enemy's next attack, set by a charge intent; 1 when not charged. */
  readonly enemyChargeMult: number;
  readonly phase: BattlePhase;
}

/** HP restored at a heal point: a fixed amount, or back to max HP. */
export type HealAmount = number | 'full';

export interface ActionWeight {
  readonly actionId: ActionId;
  readonly weight: number;
}

export interface GradeWeight {
  readonly grade: GradeId;
  readonly weight: number;
}

/** Tunable run numbers (M2 spec sections 1-4) plus the M2.5 turn rules. */
export interface RunRules extends TurnRules {
  /** Applied after every regular battle except the last one before the boss. */
  readonly healAfterBattle: HealAmount;
  /** Applied after the last regular battle instead of healAfterBattle. No heal after the boss. */
  readonly healBeforeBoss: HealAmount;
  /** Delete/enhance opportunity after clearing battle k when k % editEveryNBattles === 0. */
  readonly editEveryNBattles: number;
  readonly reelMin: number;
  readonly reelMax: number;
  readonly offerCount: number;
  /** Order is the reward candidate order (outer loop of spec 2.1). */
  readonly actionWeights: readonly ActionWeight[];
  /** Keyed by battles cleared (k = 1..); order is the inner candidate loop (grade ascending). */
  readonly gradeWeightsByCleared: Readonly<Record<number, readonly GradeWeight[]>>;
}

export interface RunDefinition {
  readonly character: CharacterDef;
  /** One enemy per battle in play order; the last one is the boss. */
  readonly stages: readonly EnemyDef[];
  readonly actions: readonly ActionDef[];
  readonly grades: GradeTable;
  readonly rules: RunRules;
}
