import type { Intent } from '../../core';
import { createElement } from '../dom';
import { formatIntent } from '../format';
import { INTENT_ICONS } from '../ui-config';

/** The enemy's next action, always visible before spinning (GDD: intent is always shown). */
export class IntentView {
  readonly element = createElement('div', 'intent');
  private readonly text = createElement('span', 'intent__text');

  constructor() {
    this.element.append(createElement('span', 'intent__label', '다음 행동'), this.text);
  }

  show(intent: Intent | null): void {
    this.element.dataset['intent'] = intent?.type ?? 'none';
    this.text.textContent = intent ? `${INTENT_ICONS[intent.type]} ${formatIntent(intent)}` : '-';
  }
}
