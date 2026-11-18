import { reelComposition, type Reel } from '../../core';
import { createElement } from '../dom';
import { formatCompositionEntry, formatReelTitle, type SymbolNames } from '../reel-format';

/** Distinct symbols per reel with counts (engine reelComposition), one column per reel. */
export function createReelComposition(reels: readonly Reel[], names: SymbolNames): HTMLElement {
  const container = createElement('div', 'reels');
  container.append(
    ...reels.map((reel, reelIndex) => {
      const column = createElement('div', 'reels__reel');
      const list = createElement('ul', 'reels__symbols');
      list.append(
        ...reelComposition(reel).map((entry) =>
          createElement('li', `reels__symbol grade-${entry.grade}`, formatCompositionEntry(entry, names)),
        ),
      );
      column.append(createElement('h3', 'reels__title', formatReelTitle(reelIndex, reel.length)), list);
      return column;
    }),
  );
  return container;
}
