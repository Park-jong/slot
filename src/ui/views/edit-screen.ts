import { editOptions, type Run } from '../../core';
import { createElement } from '../dom';
import { symbolEditChoices, turnSpins, type SymbolEditCandidate } from '../edit-candidates';
import { formatReelTitle, formatSymbol, formatTurnBasis } from '../reel-format';
import { LABELS } from '../ui-config';
import { createCandidateCard } from './candidate-card';
import { createReelPanel } from './reel-panel';
import type { ScreenView } from './screen';

export interface EditScreenHandlers {
  readonly onDelete: (reelIndex: number, symbolIndex: number) => void;
  readonly onEnhance: (reelIndex: number, symbolIndex: number) => void;
  readonly onPass: () => void;
}

interface EditSection {
  readonly title: string;
  readonly available: boolean;
  readonly unavailableText: string;
  readonly candidates: readonly SymbolEditCandidate[];
  readonly disabledReason: string;
  readonly onPick: (reelIndex: number, symbolIndex: number) => void;
}

/** reward_edit: delete one symbol, enhance one symbol, or pass; a card per (reel x symbol kind). */
export class EditScreen implements ScreenView {
  readonly element = createElement('main', 'screen');

  constructor(private readonly handlers: EditScreenHandlers) {}

  show(run: Run): void {
    const options = editOptions(run);
    const choices = symbolEditChoices(run);
    const passButton = createElement('button', 'button screen__secondary', LABELS.passEdit);
    passButton.type = 'button';
    passButton.addEventListener('click', this.handlers.onPass);
    const intro = createElement('section', 'panel');
    intro.append(
      createElement('h2', 'panel__title', LABELS.editTitle),
      createElement('p', 'screen__hint', LABELS.editHint),
      createElement('p', 'screen__hint', formatTurnBasis(turnSpins(run))),
      passButton,
    );
    this.element.replaceChildren(
      intro,
      this.section(run, {
        title: LABELS.deleteSection,
        available: options.canDelete,
        unavailableText: LABELS.deleteUnavailable,
        candidates: choices.deletions,
        disabledReason: LABELS.reelAtMinimum,
        onPick: this.handlers.onDelete,
      }),
      this.section(run, {
        title: LABELS.enhanceSection,
        available: options.canEnhance,
        unavailableText: LABELS.enhanceUnavailable,
        candidates: choices.enhancements,
        disabledReason: LABELS.topGrade,
        onPick: this.handlers.onEnhance,
      }),
      createReelPanel(run, LABELS.myReels),
    );
  }

  /** Cards grouped in one column per reel. */
  private section(run: Run, section: EditSection): HTMLElement {
    const element = createElement('section', 'panel edit-section');
    element.append(createElement('h3', 'offer__title', section.title));
    if (!section.available) {
      element.append(createElement('p', 'screen__hint', section.unavailableText));
    }
    const columns = createElement('div', 'reel-columns');
    columns.append(
      ...run.state.reels.map((reel, reelIndex) => {
        const column = createElement('div', 'reel-columns__reel');
        const cards = section.candidates
          .filter((candidate) => candidate.reelIndex === reelIndex)
          .map((candidate) =>
            createCandidateCard({
              title: `${formatSymbol(candidate.symbol, run.definition)} ×${candidate.count}`,
              buttonLabel: section.title,
              preview: candidate.preview,
              disabledReason: section.disabledReason,
              names: run.definition,
              onPick: () => section.onPick(candidate.reelIndex, candidate.symbolIndex),
            }),
          );
        column.append(createElement('h4', 'reels__title', formatReelTitle(reelIndex, reel.length)), ...cards);
        return column;
      }),
    );
    element.append(columns);
    return element;
  }
}
