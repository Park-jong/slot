import { LINES, type Cell, type LineDef, type LineId } from './lines';
import type { ActionId, Board, GradeTable, ReelSymbol } from './types';

export interface FiredLine {
  readonly lineId: LineId;
  readonly actionId: ActionId;
  /** Sum of the 3 cells' grade values (3..12 with M1 grades). */
  readonly gradeSum: number;
  readonly cells: readonly Cell[];
}

export interface ActionJudgement {
  readonly lineCount: number;
  readonly gradeSumTotal: number;
}

export interface JudgeResult {
  /** Fired lines in the fixed line order H1..D2. */
  readonly firedLines: readonly FiredLine[];
  /** Only actions with at least one fired line are present. */
  readonly byAction: Readonly<Record<ActionId, ActionJudgement>>;
}

/** Pure line evaluation (spec 2.3). Uses no randomness; grades only matter for the sums. */
export function judge(board: Board, grades: GradeTable): JudgeResult {
  const firedLines = LINES.flatMap((line) => {
    const fired = evaluateLine(board, line, grades);
    return fired ? [fired] : [];
  });
  return { firedLines, byAction: groupByAction(firedLines) };
}

function evaluateLine(board: Board, line: LineDef, grades: GradeTable): FiredLine | null {
  const symbols = line.cells.map((cell) => symbolAt(board, cell));
  const [first] = symbols;
  if (!first || symbols.some((symbol) => symbol.actionId !== first.actionId)) {
    return null;
  }
  const gradeSum = symbols.reduce((sum, symbol) => sum + gradeValue(grades, symbol), 0);
  return { lineId: line.id, actionId: first.actionId, gradeSum, cells: line.cells };
}

function groupByAction(firedLines: readonly FiredLine[]): Record<ActionId, ActionJudgement> {
  const byAction: Record<ActionId, ActionJudgement> = {};
  for (const line of firedLines) {
    const previous = byAction[line.actionId];
    byAction[line.actionId] = {
      lineCount: (previous?.lineCount ?? 0) + 1,
      gradeSumTotal: (previous?.gradeSumTotal ?? 0) + line.gradeSum,
    };
  }
  return byAction;
}

function symbolAt(board: Board, cell: Cell): ReelSymbol {
  const symbol = board[cell.reel]?.[cell.row];
  if (!symbol) {
    throw new Error(`judge: board has no symbol at reel ${cell.reel}, row ${cell.row}`);
  }
  return symbol;
}

function gradeValue(grades: GradeTable, symbol: ReelSymbol): number {
  const grade = grades[symbol.grade];
  if (!grade) {
    throw new Error(`judge: unknown grade ${symbol.grade} on action ${symbol.actionId}`);
  }
  return grade.value;
}
