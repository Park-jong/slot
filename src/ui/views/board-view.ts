import { GRID_SIZE, type BattleConfig, type Board, type Cell, type JudgeResult, type ReelSymbol } from '../../core';
import { createElement } from '../dom';
import { actionIcon, actionName, gradeName } from '../format';
import { formatSpinCaption } from '../turn-format';
import { EMPTY_CELL_ICON } from '../ui-config';

export interface ReelTiming {
  readonly firstStopMs: number;
  readonly stopIntervalMs: number;
}

/** One spin of a turn with its board: a SpinReport or a SpinRecord. */
export interface BoardSpin {
  readonly index: number;
  readonly board: Board;
  readonly judgement: JudgeResult;
}

const cellKey = (cell: Cell): string => `${cell.reel}:${cell.row}`;

/** Cells covered by the spin's fired lines, as cellKey strings. */
export function firedCellKeys(judgement: JudgeResult): ReadonlySet<string> {
  return new Set(judgement.firedLines.flatMap((line) => line.cells.map(cellKey)));
}

/** Whether the cell at (reel, row) is part of a fired line. */
export function isFired(firedCells: ReadonlySet<string>, reel: number, row: number): boolean {
  return firedCells.has(cellKey({ reel, row }));
}

/** The latest spin as a large 3x3 board: columns are reels, rows top to bottom (board[reel][row]). Owns the reel-stop animation. */
export class BoardView {
  readonly element = createElement('div', 'board-view');
  private readonly reels: HTMLElement[] = [];
  private readonly cells: HTMLElement[][] = [];
  private readonly caption = createElement('p', 'board__caption');
  private pendingTimers: number[] = [];

  constructor() {
    const grid = createElement('div', 'board');
    for (let reel = 0; reel < GRID_SIZE; reel++) {
      const column = createElement('div', 'reel');
      const cells = Array.from({ length: GRID_SIZE }, () => createElement('div', 'cell'));
      column.append(...cells);
      grid.append(column);
      this.reels.push(column);
      this.cells.push(cells);
    }
    this.caption.setAttribute('aria-live', 'polite');
    this.element.append(grid, this.caption);
  }

  /** Empty board with a hint caption. */
  reset(caption: string): void {
    this.cancel();
    for (const column of this.cells) {
      for (const cell of column) {
        renderEmptyCell(cell);
      }
    }
    this.caption.textContent = caption;
  }

  /** Reveals the board reel by reel, then highlights the spin's fired lines and calls onDone. */
  playSpin(spin: BoardSpin, config: BattleConfig, timing: ReelTiming, onDone: () => void): void {
    this.cancel();
    this.clearHighlights();
    this.caption.textContent = '...';
    this.reels.forEach((column) => column.classList.add('reel--spinning'));
    this.reels.forEach((column, reel) => {
      const isLast = reel === this.reels.length - 1;
      this.schedule(timing.firstStopMs + reel * timing.stopIntervalMs, () => {
        column.classList.remove('reel--spinning');
        this.renderReel(spin.board, reel, config);
        if (isLast) {
          this.showJudgement(spin, config);
          onDone();
        }
      });
    });
  }

  /** Shows a spin at once (no animation), e.g. when the screen is re-shown mid-turn. */
  showSpin(spin: BoardSpin, config: BattleConfig): void {
    this.cancel();
    this.reels.forEach((_, reel) => this.renderReel(spin.board, reel, config));
    this.showJudgement(spin, config);
  }

  /** Stops any running animation; safe to call at any time (e.g. restarting mid-spin). */
  cancel(): void {
    this.pendingTimers.forEach((timer) => window.clearTimeout(timer));
    this.pendingTimers = [];
    this.reels.forEach((column) => column.classList.remove('reel--spinning'));
  }

  private schedule(delayMs: number, task: () => void): void {
    this.pendingTimers.push(window.setTimeout(task, delayMs));
  }

  private renderReel(board: Board, reel: number, config: BattleConfig): void {
    this.cells[reel]?.forEach((cell, row) => {
      const symbol = board[reel]?.[row];
      if (symbol) {
        renderSymbolCell(cell, symbol, config);
      }
    });
  }

  private showJudgement(spin: BoardSpin, config: BattleConfig): void {
    const firedCells = firedCellKeys(spin.judgement);
    this.cells.forEach((column, reel) =>
      column.forEach((cell, row) => cell.classList.toggle('cell--fired', isFired(firedCells, reel, row))),
    );
    this.caption.textContent = formatSpinCaption(spin, config);
  }

  private clearHighlights(): void {
    this.cells.flat().forEach((cell) => cell.classList.remove('cell--fired'));
  }
}

function renderEmptyCell(cell: HTMLElement): void {
  cell.className = 'cell cell--empty';
  cell.replaceChildren(createElement('span', 'cell__icon', EMPTY_CELL_ICON));
  cell.removeAttribute('title');
}

export function renderSymbolCell(cell: HTMLElement, symbol: ReelSymbol, config: BattleConfig): void {
  const name = actionName(config, symbol.actionId);
  const grade = gradeName(config, symbol.grade);
  cell.className = `cell grade-${symbol.grade}`;
  cell.replaceChildren(
    createElement('span', 'cell__icon', actionIcon(symbol.actionId)),
    createElement('span', 'cell__label', name),
    createElement('span', 'cell__grade', grade),
  );
  cell.title = `${name} (${grade})`;
}
