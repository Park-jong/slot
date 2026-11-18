import type { ReelEditPreview } from '../../core';
import { createElement } from '../dom';
import { statRows, type SymbolNames } from '../reel-format';
import { createStatTable } from './stat-table';

export interface CandidateCardOptions {
  readonly title: string;
  readonly buttonLabel: string;
  /** Null when the engine does not allow this choice; the button is disabled and the reason shown. */
  readonly preview: ReelEditPreview | null;
  readonly disabledReason: string;
  readonly names: SymbolNames;
  readonly onPick: () => void;
}

/** One reward/edit choice: its button and the exact before/after probabilities of picking it. */
export function createCandidateCard(options: CandidateCardOptions): HTMLElement {
  const card = createElement('div', 'candidate');
  const button = createElement('button', 'button button--primary candidate__button', options.buttonLabel);
  button.type = 'button';
  card.append(createElement('h4', 'candidate__title', options.title), button);
  if (!options.preview) {
    button.disabled = true;
    card.classList.add('candidate--disabled');
    card.append(createElement('p', 'candidate__reason', options.disabledReason));
    return card;
  }
  button.addEventListener('click', options.onPick);
  card.append(createStatTable(statRows(options.preview, options.names)));
  return card;
}
