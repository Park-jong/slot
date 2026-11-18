import type { Run } from '../../core';
import { createElement } from '../dom';
import { offerChoices, turnSpins, type OfferChoice } from '../edit-candidates';
import { formatReelTitle, formatSymbol, formatTurnBasis, reelLabel } from '../reel-format';
import { LABELS } from '../ui-config';
import { createCandidateCard } from './candidate-card';
import { createReelPanel } from './reel-panel';
import type { ScreenView } from './screen';

export interface RewardScreenHandlers {
  readonly onChoose: (offerIndex: number, reelIndex: number) => void;
  readonly onSkip: () => void;
}

/** reward_add: the offers, a card per (offer x reel) with its preview, and the skip button. */
export class RewardScreen implements ScreenView {
  readonly element = createElement('main', 'screen');

  constructor(private readonly handlers: RewardScreenHandlers) {}

  show(run: Run): void {
    const skipButton = createElement('button', 'button screen__secondary', LABELS.skipReward);
    skipButton.type = 'button';
    skipButton.addEventListener('click', this.handlers.onSkip);
    const intro = createElement('section', 'panel');
    intro.append(
      createElement('h2', 'panel__title', LABELS.rewardTitle),
      createElement('p', 'screen__hint', LABELS.rewardHint),
      createElement('p', 'screen__hint', formatTurnBasis(turnSpins(run))),
      skipButton,
    );
    this.element.replaceChildren(
      intro,
      ...offerChoices(run).map((choice) => this.offerSection(run, choice)),
      createReelPanel(run, LABELS.myReels),
    );
  }

  private offerSection(run: Run, choice: OfferChoice): HTMLElement {
    const section = createElement('section', 'panel offer');
    section.append(createElement('h3', 'offer__title', formatSymbol(choice.symbol, run.definition)));
    const cards = createElement('div', 'candidates');
    cards.append(
      ...choice.candidates.map((candidate) =>
        createCandidateCard({
          title: formatReelTitle(candidate.reelIndex, run.state.reels[candidate.reelIndex]?.length ?? 0),
          buttonLabel: `${reelLabel(candidate.reelIndex)}에 추가`,
          preview: candidate.preview,
          disabledReason: LABELS.reelFull,
          names: run.definition,
          onPick: () => this.handlers.onChoose(candidate.offerIndex, candidate.reelIndex),
        }),
      ),
    );
    section.append(cards);
    return section;
  }
}
