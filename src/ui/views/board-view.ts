import { GRID_SIZE, type BattleConfig, type Board, type Cell, type ReelSymbol, type TurnReport } from '../../core';
import { createElement } from '../dom';
import { actionIcon, actionName, formatFiredLine, gradeName } from '../format';
import { EMPTY_CELL_ICON } from '../ui-config';

export interface ReelTiming {
  readonly firstStopMs: number;
  readonly stopIntervalMs: number;
}

const cellKey = (cell: Cell): string => `${cell.reel}:${cell.row}`;

/** 3x3 board: columns are reels, rows top to bottom (board[reel][row]). Owns the reel-stop animation. */
export class BoardView {
  readonly element = createElement('section', 'panel board-panel');
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
    this.element.append(grid, this.caption);
    this.reset();
  }

  reset(): void {
    this.cancel();
    for (const column of this.cells) {
      for (const cell of column) {
        renderEmptyCell(cell);
      }
    }
    this.caption.textContent = '스핀을 눌러 전투를 시작하세요';
  }

  /** Reveals the board reel by reel, then highlights fired lines and calls onDone. */
  playSpin(report: TurnReport, config: BattleConfig, timing: ReelTiming, onDone: () => void): void {
    this.cancel();
    this.clearHighlights();
    this.caption.textContent = '...';
    this.reels.forEach((column) => column.classList.add('reel--spinning'));
    this.reels.forEach((column, reel) => {
      const isLast = reel === this.reels.length - 1;
      this.schedule(timing.firstStopMs + reel * timing.stopIntervalMs, () => {
        column.classList.remove('reel--spinning');
        this.renderReel(report.board, reel, config);
        if (isLast) {
          this.showJudgement(report, config);
          onDone();
        }
      });
    });
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

  private showJudgement(report: TurnReport, config: BattleConfig): void {
    const { firedLines } = report.judgement;
    const firedCells = new Set(firedLines.flatMap((line) => line.cells.map(cellKey)));
    this.cells.forEach((column, reel) =>
      column.forEach((cell, row) => cell.classList.toggle('cell--fired', firedCells.has(cellKey({ reel, row })))),
    );
    this.caption.textContent =
      firedLines.length > 0
        ? firedLines.map((line) => formatFiredLine(line, config)).join(' / ')
        : '발동한 라인 없음';
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

function renderSymbolCell(cell: HTMLElement, symbol: ReelSymbol, config: BattleConfig): void {
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
