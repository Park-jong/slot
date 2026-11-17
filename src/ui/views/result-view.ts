import { createElement } from '../dom';
import type { BattleResultText } from '../format';
import { RESULT_ICONS } from '../ui-config';

/** Victory/defeat overlay with a restart button. */
export class ResultView {
  readonly element = createElement('div', 'result');
  private readonly icon = createElement('div', 'result__icon');
  private readonly title = createElement('h2', 'result__title');
  private readonly summary = createElement('p', 'result__summary');
  private readonly restartButton = createElement('button', 'button button--primary', '다시 하기');

  constructor(onRestart: () => void) {
    this.restartButton.type = 'button';
    this.restartButton.addEventListener('click', onRestart);
    const dialog = createElement('div', 'result__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.append(this.icon, this.title, this.summary, this.restartButton);
    this.element.append(dialog);
    this.hide();
  }

  show(text: BattleResultText): void {
    this.element.dataset['phase'] = text.phase;
    this.icon.textContent = RESULT_ICONS[text.phase];
    this.title.textContent = text.title;
    this.summary.textContent = text.summary;
    this.element.hidden = false;
    this.restartButton.focus();
  }

  hide(): void {
    this.element.hidden = true;
  }
}
