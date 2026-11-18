import type { IntentPreview } from '../../core';
import { createElement } from '../dom';
import { formatIntentPreview } from '../format';
import { INTENT_ICONS, LABELS } from '../ui-config';

/** The enemy's next action, always visible before spinning (GDD: intent is always shown). */
export class IntentView {
  readonly element = createElement('div', 'intent');
  private readonly text = createElement('span', 'intent__text');

  constructor() {
    this.element.append(createElement('span', 'intent__label', LABELS.intent), this.text);
  }

  show(preview: IntentPreview | null): void {
    this.element.dataset['intent'] = preview?.type ?? 'none';
    this.element.classList.toggle('intent--charged', preview?.charged ?? false);
    this.text.textContent = preview ? `${INTENT_ICONS[preview.type]} ${formatIntentPreview(preview)}` : '-';
  }
}
