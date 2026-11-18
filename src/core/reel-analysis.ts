// Exact per-turn reel statistics for the reel-edit screen (m2-run-spec section 8, m25-multispin-spec 8.5).
// Pure and deterministic: no rng, no Monte Carlo. Line geometry comes from ./lines (single source).
// A turn of k spins pools the lines of k independent spins, so its line-count distribution is the k-fold
// convolution of one spin's joint distribution.
import { GRID_SIZE, LINES } from './lines';
import { nextGrade } from './reel-edit';
import type { ActionId, GradeId, GradeTable, Reel, ReelSymbol } from './types';

export interface ActionAnalysis {
  /** P(at least one line of this action fires in a turn, pooled over its spins). */
  readonly fire: number;
  /** P(two or more pooled lines of this action). */
  readonly fire2plus: number;
  /** P(three or more pooled lines: the last tier and the ignore_guard threshold in M2.5). */
  readonly fire3plus: number;
  /** Expected number of pooled lines of this action per turn. */
  readonly expectedLines: number;
  /** Mean grade value of this action's symbols over all reels; 0 when it has no symbols. */
  readonly avgGradeValue: number;
}

export interface ReelAnalysis {
  /** P(no line fires in any spin of the turn) = emptySpin ^ spins. */
  readonly empty: number;
  /** P(no line fires in one spin), whatever options.spins is. */
  readonly emptySpin: number;
  /** Key order: `options.actionIds` first, then actions by first appearance (reel 0 first, top to bottom). */
  readonly actions: Readonly<Record<ActionId, ActionAnalysis>>;
  readonly reelSizes: readonly number[];
}

export interface AnalyzeOptions {
  /** Grade values for `avgGradeValue` and the grade order for enhance previews. */
  readonly grades: GradeTable;
  /** Actions always present in the result (fire 0 when absent from every reel), e.g. every action the UI lists. */
  readonly actionIds?: readonly ActionId[];
  /** Spins pooled into one turn (positive integer, normally the effective max spins); default 1. */
  readonly spins?: number;
  /** Upper bound for spins (the run's spinsPerTurnHardCap, M2.5 spec 8.5); omitted = no bound. */
  readonly spinsPerTurnHardCap?: number;
}

export interface ReelCompositionEntry {
  readonly actionId: ActionId;
  readonly grade: GradeId;
  readonly count: number;
}

export type ReelEdit =
  | { readonly kind: 'add'; readonly reelIndex: number; readonly symbol: ReelSymbol }
  | { readonly kind: 'delete'; readonly reelIndex: number; readonly symbolIndex: number }
  | { readonly kind: 'enhance'; readonly reelIndex: number; readonly symbolIndex: number };

export interface ReelEditPreview {
  readonly before: ReelAnalysis;
  readonly after: ReelAnalysis;
}

const MIN_LINES_FOR_FIRE2PLUS = 2;
const MIN_LINES_FOR_FIRE3PLUS = 3;
const DEFAULT_SPINS = 1;
const NO_ACTION = -1;

/** One reel's drawn column as action indices (row 0 first) and its integer weight (number of index tuples). */
interface ReelPattern {
  readonly actions: readonly number[];
  readonly weight: number;
}

/**
 * Per-action line counts packed into one integer key: count of action a times base^a. base exceeds the
 * largest pooled count of one action, so adding two keys adds the counts digit by digit (no carries).
 */
interface CountEncoding {
  readonly base: number;
  readonly placeValues: readonly number[];
}

/** Weights by count key; probability = weight / total (integer weights for one spin keep it exact). */
interface LineCountDistribution {
  readonly weights: ReadonlyMap<number, number>;
  readonly total: number;
}

/**
 * Exact turn statistics. Each reel's ordered draw of GRID_SIZE distinct symbols is reduced to action patterns
 * with integer weights; every combination of the reels' patterns is judged on all lines. Weights are
 * integers kept below 2^53, so accumulation is exact and only the final division rounds.
 */
export function analyzeReels(reels: readonly Reel[], options: AnalyzeOptions): ReelAnalysis {
  validateReels(reels);
  const spins = validSpins(options);
  const actionIds = collectActionIds(reels, options.actionIds ?? []);
  const indexOf = new Map(actionIds.map((id, index) => [id, index]));
  const patternsPerReel = reels.map((reel) => reelPatterns(reel, actionIds.length, indexOf));
  const totalWeight = reels.reduce((product, reel) => product * fallingFactorial(reel.length, GRID_SIZE), 1);
  // expectedLines accumulates weight x lines, so the largest sum is totalWeight x LINE_COUNT.
  if (totalWeight * LINE_COUNT > Number.MAX_SAFE_INTEGER) {
    throw new Error(`analyzeReels: reels too large for exact analysis (sizes ${reels.map((r) => r.length).join(', ')})`);
  }

  const encoding = countEncoding(actionIds.length, spins);
  const single: LineCountDistribution = { weights: spinWeights(patternsPerReel, encoding), total: totalWeight };
  const turn = spins === DEFAULT_SPINS ? single : convolvePower(single, spins);
  const actions: Record<ActionId, ActionAnalysis> = {};
  actionIds.forEach((actionId, index) => {
    actions[actionId] = {
      ...lineStats(turn, encoding, index),
      avgGradeValue: averageGradeValue(reels, actionId, options.grades),
    };
  });
  return {
    empty: probabilityOf(turn, 0),
    emptySpin: probabilityOf(single, 0),
    actions,
    reelSizes: reels.map((reel) => reel.length),
  };
}

function validSpins({ spins = DEFAULT_SPINS, spinsPerTurnHardCap = Number.POSITIVE_INFINITY }: AnalyzeOptions): number {
  if (!Number.isInteger(spins) || spins < DEFAULT_SPINS || spins > spinsPerTurnHardCap) {
    throw new Error(`analyzeReels: spins ${spins} must be an integer in ${DEFAULT_SPINS}..${spinsPerTurnHardCap}`);
  }
  return spins;
}

/** Distinct (action, grade) counts. Order: actions by first appearance in the reel, grades ascending within an action. */
export function reelComposition(reel: Reel): ReelCompositionEntry[] {
  const countsByAction = new Map<ActionId, Map<GradeId, number>>();
  for (const { actionId, grade } of reel) {
    const byGrade = countsByAction.get(actionId) ?? new Map<GradeId, number>();
    byGrade.set(grade, (byGrade.get(grade) ?? 0) + 1);
    countsByAction.set(actionId, byGrade);
  }
  return [...countsByAction].flatMap(([actionId, byGrade]) =>
    [...byGrade]
      .sort(([gradeA], [gradeB]) => gradeA - gradeB)
      .map(([grade, count]) => ({ actionId, grade, count })),
  );
}

/**
 * Analysis before and after one edit. Throws on out-of-range indices, on an edit that leaves a reel shorter
 * than GRID_SIZE, and on enhancing a symbol already at the highest grade. Enhance uses the run's next-grade
 * rule (reel-edit `nextGrade`). Run-rule limits (reel min/max size, edit opportunities) belong to the run module.
 */
export function previewEdit(reels: readonly Reel[], edit: ReelEdit, options: AnalyzeOptions): ReelEditPreview {
  return { before: analyzeReels(reels, options), after: analyzeEdit(reels, edit, options) };
}

/**
 * The `after` half of previewEdit (same validation). Lets a caller previewing many edits of the same reels
 * analyze the unedited reels once instead of once per edit.
 */
export function analyzeEdit(reels: readonly Reel[], edit: ReelEdit, options: AnalyzeOptions): ReelAnalysis {
  return analyzeReels(applyEdit(reels, edit, options.grades), options);
}

function applyEdit(reels: readonly Reel[], edit: ReelEdit, grades: GradeTable): Reel[] {
  const reel = reelAt(reels, edit.reelIndex);
  const replaceReel = (next: Reel): Reel[] => reels.map((current, index) => (index === edit.reelIndex ? next : current));
  switch (edit.kind) {
    case 'add':
      return replaceReel([...reel, edit.symbol]);
    case 'delete':
      symbolAt(reel, edit.symbolIndex);
      return replaceReel(reel.filter((_, index) => index !== edit.symbolIndex));
    case 'enhance': {
      const enhanced = enhancedSymbol(symbolAt(reel, edit.symbolIndex), grades);
      return replaceReel(reel.map((symbol, index) => (index === edit.symbolIndex ? enhanced : symbol)));
    }
  }
}

function enhancedSymbol(symbol: ReelSymbol, grades: GradeTable): ReelSymbol {
  const grade = nextGrade(grades, symbol.grade);
  if (grade === undefined) {
    throw new Error(`previewEdit: ${symbol.actionId} grade ${symbol.grade} cannot be enhanced (already the highest)`);
  }
  return { actionId: symbol.actionId, grade };
}

function reelAt(reels: readonly Reel[], reelIndex: number): Reel {
  const reel = Number.isInteger(reelIndex) ? reels[reelIndex] : undefined;
  if (!reel) {
    throw new Error(`previewEdit: reel index ${reelIndex} out of range 0..${reels.length - 1}`);
  }
  return reel;
}

function symbolAt(reel: Reel, symbolIndex: number): ReelSymbol {
  const symbol = Number.isInteger(symbolIndex) ? reel[symbolIndex] : undefined;
  if (!symbol) {
    throw new Error(`previewEdit: symbol index ${symbolIndex} out of range 0..${reel.length - 1}`);
  }
  return symbol;
}

function validateReels(reels: readonly Reel[]): void {
  if (reels.length !== GRID_SIZE) {
    throw new Error(`analyzeReels: expected ${GRID_SIZE} reels, got ${reels.length}`);
  }
  reels.forEach((reel, index) => {
    if (reel.length < GRID_SIZE) {
      throw new Error(`analyzeReels: reel ${index} has ${reel.length} symbols, needs at least ${GRID_SIZE}`);
    }
  });
}

function collectActionIds(reels: readonly Reel[], requested: readonly ActionId[]): ActionId[] {
  const ids = new Set<ActionId>(requested);
  for (const reel of reels) {
    for (const symbol of reel) {
      ids.add(symbol.actionId);
    }
  }
  return [...ids];
}

/**
 * Ordered draws without replacement, merged by action sequence. Same result as enumerating all
 * n(n-1)(n-2) index tuples and merging identical patterns (spec 8): a sequence's tuple count is the product,
 * per position, of that action's symbol count minus earlier positions already holding the same action.
 */
function reelPatterns(reel: Reel, actionCount: number, indexOf: ReadonlyMap<ActionId, number>): ReelPattern[] {
  const symbolCounts = new Array<number>(actionCount).fill(0);
  for (const symbol of reel) {
    const index = indexOf.get(symbol.actionId) ?? 0;
    symbolCounts[index] = (symbolCounts[index] ?? 0) + 1;
  }
  const patterns: ReelPattern[] = [];
  const extend = (prefix: number[], weight: number): void => {
    if (prefix.length === GRID_SIZE) {
      patterns.push({ actions: prefix, weight });
      return;
    }
    for (let action = 0; action < actionCount; action++) {
      const remaining = (symbolCounts[action] ?? 0) - prefix.filter((drawn) => drawn === action).length;
      if (remaining > 0) {
        extend([...prefix, action], weight * remaining);
      }
    }
  };
  extend([], 1);
  return patterns;
}

/** Line cells flattened (GRID_SIZE per line) as indices into a flat board: cell (reel, row) = reel * GRID_SIZE + row. */
const LINE_CELLS = Int32Array.from(LINES.flatMap((line) => line.cells.map((cell) => cell.reel * GRID_SIZE + cell.row)));
const LINE_COUNT = LINES.length;

function countEncoding(actionCount: number, spins: number): CountEncoding {
  const base = LINE_COUNT * spins + 1;
  if (base ** actionCount > Number.MAX_SAFE_INTEGER) {
    throw new Error(`analyzeReels: ${actionCount} actions x ${spins} spins is too large for exact analysis`);
  }
  return { base, placeValues: Array.from({ length: actionCount }, (_, action) => base ** action) };
}

// Hot path (up to 27^3 boards per call, 18 calls per 9-option preview): plain indexed loops over typed arrays.
function spinWeights(patternsPerReel: readonly (readonly ReelPattern[])[], encoding: CountEncoding): Map<number, number> {
  const weights = new Map<number, number>();
  const board = new Int32Array(GRID_SIZE * GRID_SIZE);

  const scoreBoard = (weight: number): void => {
    let key = 0;
    for (let line = 0; line < LINE_COUNT; line++) {
      const action = lineAction(board, line);
      if (action !== NO_ACTION) key += encoding.placeValues[action] ?? 0;
    }
    weights.set(key, (weights.get(key) ?? 0) + weight);
  };

  const placeReel = (reelIndex: number, weight: number): void => {
    if (reelIndex === patternsPerReel.length) {
      scoreBoard(weight);
      return;
    }
    const offset = reelIndex * GRID_SIZE;
    for (const pattern of patternsPerReel[reelIndex] ?? []) {
      for (let row = 0; row < GRID_SIZE; row++) {
        board[offset + row] = pattern.actions[row] ?? NO_ACTION;
      }
      placeReel(reelIndex + 1, weight * pattern.weight);
    }
  };
  placeReel(0, 1);
  return weights;
}

/** k independent spins pooled: the k-fold convolution of the one-spin distribution, as probabilities. */
function convolvePower(single: LineCountDistribution, spins: number): LineCountDistribution {
  const unit = new Map([...single.weights].map(([key, weight]) => [key, weight / single.total]));
  let turn: ReadonlyMap<number, number> = unit;
  for (let spin = DEFAULT_SPINS; spin < spins; spin++) {
    const next = new Map<number, number>();
    for (const [turnKey, turnProbability] of turn) {
      for (const [spinKey, spinProbability] of unit) {
        const key = turnKey + spinKey;
        next.set(key, (next.get(key) ?? 0) + turnProbability * spinProbability);
      }
    }
    turn = next;
  }
  return { weights: turn, total: 1 };
}

function lineStats(
  distribution: LineCountDistribution,
  encoding: CountEncoding,
  action: number,
): Omit<ActionAnalysis, 'avgGradeValue'> {
  const placeValue = encoding.placeValues[action] ?? 1;
  let fire = 0;
  let fire2plus = 0;
  let fire3plus = 0;
  let lines = 0;
  for (const [key, weight] of distribution.weights) {
    const count = Math.floor(key / placeValue) % encoding.base;
    if (count === 0) continue;
    fire += weight;
    lines += weight * count;
    if (count >= MIN_LINES_FOR_FIRE2PLUS) fire2plus += weight;
    if (count >= MIN_LINES_FOR_FIRE3PLUS) fire3plus += weight;
  }
  const { total } = distribution;
  return { fire: fire / total, fire2plus: fire2plus / total, fire3plus: fire3plus / total, expectedLines: lines / total };
}

function probabilityOf(distribution: LineCountDistribution, key: number): number {
  return (distribution.weights.get(key) ?? 0) / distribution.total;
}

/** The action filling every cell of the line, or NO_ACTION. */
function lineAction(board: Int32Array, line: number): number {
  const base = line * GRID_SIZE;
  const action = board[LINE_CELLS[base] ?? 0] ?? NO_ACTION;
  for (let i = 1; i < GRID_SIZE; i++) {
    if (board[LINE_CELLS[base + i] ?? 0] !== action) return NO_ACTION;
  }
  return action;
}

function averageGradeValue(reels: readonly Reel[], actionId: ActionId, grades: GradeTable): number {
  const values = reels.flatMap((reel) =>
    reel.filter((symbol) => symbol.actionId === actionId).map((symbol) => gradeValue(symbol, grades)),
  );
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function gradeValue(symbol: ReelSymbol, grades: GradeTable): number {
  const grade = grades[symbol.grade];
  if (!grade) {
    throw new Error(`analyzeReels: unknown grade ${symbol.grade} on action ${symbol.actionId}`);
  }
  return grade.value;
}

function fallingFactorial(n: number, k: number): number {
  let product = 1;
  for (let i = 0; i < k; i++) product *= n - i;
  return product;
}
