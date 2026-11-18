import type { Run } from '../../core';
import { createElement } from '../dom';
import { formatRunEnd } from '../run-format';
import { LABELS, RESULT_ICONS } from '../ui-config';
import { createReelPanel } from './reel-panel';
import type { ScreenView } from './screen';

/** Victory or defeat: stage reached, final reels and a restart with a new seed. */
export class RunEndScreen implements ScreenView {
  readonly element = createElement('main', 'screen');
  private readonly restartButton = createElement('button', 'button button--primary', LABELS.restart);

  constructor(onRestart: () => void) {
    this.restartButton.type = 'button';
    this.restartButton.addEventListener('click', onRestart);
  }

  show(run: Run): void {
    const text = formatRunEnd(run);
    if (!text) {
      throw new Error(`RunEndScreen: run is still in ${run.state.phase}`);
    }
    const result = createElement('section', 'panel run-end');
    result.dataset['phase'] = text.phase;
    result.append(
      createElement('div', 'result__icon', RESULT_ICONS[text.phase]),
      createElement('h2', 'result__title', text.title),
      createElement('p', 'result__summary', text.summary),
      this.restartButton,
    );
    this.element.replaceChildren(result, createReelPanel(run, LABELS.finalReels));
  }
}
