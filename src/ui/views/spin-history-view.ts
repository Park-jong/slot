import { GRID_SIZE, type BattleConfig } from '../../core';
import { createElement } from '../dom';
import { formatSpinCaption } from '../turn-format';
import { LABELS } from '../ui-config';
import { firedCellKeys, isFired, renderSymbolCell, type BoardSpin } from './board-view';

/** Earlier spins of the turn as small boards with their fired lines (U1, U2); the latest one is the large board. */
export class SpinHistoryView {
  readonly element = createElement('section', 'spin-history');
  private readonly list = createElement('ol', 'spin-history__list');

  constructor() {
    this.element.append(createElement('h3', 'spin-history__title', LABELS.earlierSpins), this.list);
    this.show([], null);
  }

  show(spins: readonly BoardSpin[], config: BattleConfig | null): void {
    this.element.hidden = spins.length === 0 || !config;
    this.list.replaceChildren(...(config ? spins.map((spin) => createThumbnail(spin, config)) : []));
  }
}

function createThumbnail(spin: BoardSpin, config: BattleConfig): HTMLElement {
  const item = createElement('li', 'spin-history__spin');
  const grid = createElement('div', 'board board--mini');
  const firedCells = firedCellKeys(spin.judgement);
  for (let reel = 0; reel < GRID_SIZE; reel++) {
    const column = createElement('div', 'reel');
    for (let row = 0; row < GRID_SIZE; row++) {
      const cell = createElement('div', 'cell');
      const symbol = spin.board[reel]?.[row];
      if (symbol) {
        renderSymbolCell(cell, symbol, config);
      }
      cell.classList.toggle('cell--fired', isFired(firedCells, reel, row));
      column.append(cell);
    }
    grid.append(column);
  }
  item.append(grid, createElement('p', 'spin-history__caption', formatSpinCaption(spin, config)));
  return item;
}
