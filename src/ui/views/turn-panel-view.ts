import type { BattleConfig, StopPreview, TurnStats } from '../../core';
import { createElement } from '../dom';
import type { TurnLog } from '../format';
import type { SpinningProgress } from '../turn-progress';
import {
  formatContinueEstimate,
  formatStopPreview,
  formatTurnStartHint,
  pooledActionTexts,
  TURN_TEXT,
  type PooledActionText,
} from '../turn-format';
import { LABELS } from '../ui-config';
import { createLogSection } from './log-view';

/**
 * The turn beside the board: the start hint, then while spinning the pooled status per action (U3), the
 * "stop now" preview (U5) and the continue estimate (U6), and after the settlement its log (U10, U11).
 */
export class TurnPanelView {
  readonly element = createElement('section', 'panel turn-panel');
  private readonly title = createElement('h2', 'panel__title');
  private readonly body = createElement('div', 'turn-panel__body');

  constructor() {
    this.body.setAttribute('aria-live', 'polite');
    this.element.append(this.title, this.body);
  }

  showTurnStart(stats: TurnStats): void {
    this.title.textContent = LABELS.turnPanel;
    this.body.replaceChildren(createElement('p', 'turn-panel__hint', formatTurnStartHint(stats)));
  }

  showSpinning({ preview, estimate }: SpinningProgress, config: BattleConfig): void {
    this.title.textContent = LABELS.pooledTitle;
    this.body.replaceChildren(createPooledList(pooledActionTexts(preview, config)), createStopPreview(preview, config));
    if (estimate) {
      this.body.append(createElement('p', 'turn-panel__estimate', formatContinueEstimate(estimate)));
    }
  }

  showSettlement(log: TurnLog): void {
    this.title.textContent = log.title;
    this.body.replaceChildren(...log.sections.map(createLogSection));
  }
}

function createPooledList(actions: readonly PooledActionText[]): HTMLElement {
  const list = createElement('ul', 'pooled');
  if (actions.length === 0) {
    list.append(createElement('li', 'pooled__none', TURN_TEXT.noLinesYet));
    return list;
  }
  list.append(...actions.map(createPooledAction));
  return list;
}

function createPooledAction(action: PooledActionText): HTMLElement {
  const item = createElement('li', 'pooled__action');
  const head = createElement('div', 'pooled__head');
  head.append(
    createElement('span', 'pooled__title', action.title),
    createElement('span', 'pooled__detail', action.detail),
    createElement('span', 'pooled__value', action.value),
  );
  item.append(head, createElement('span', 'pooled__hint', action.hint));
  return item;
}

function createStopPreview(preview: StopPreview, config: BattleConfig): HTMLElement {
  const box = createElement('div', 'stop-preview');
  box.classList.toggle('stop-preview--lethal', preview.lethal);
  box.classList.toggle('stop-preview--empty', preview.empty);
  box.append(
    ...formatStopPreview(preview, config.character.maxHp).map((line) => createElement('p', 'stop-preview__line', line)),
  );
  return box;
}
