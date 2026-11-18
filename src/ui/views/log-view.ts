import { createElement } from '../dom';
import type { TurnLog } from '../format';
import { LABELS } from '../ui-config';

/** Combat log, newest turn on top. Only renders already formatted text. */
export class LogView {
  readonly element = createElement('section', 'panel log-panel');
  private readonly list = createElement('ol', 'log');

  constructor() {
    this.list.setAttribute('aria-live', 'polite');
    this.element.append(createElement('h2', 'panel__title', LABELS.battleLog), this.list);
  }

  reset(intro: string): void {
    this.list.replaceChildren(createElement('li', 'log__entry log__entry--intro', intro));
  }

  addTurn(turn: TurnLog): void {
    const entry = createElement('li', 'log__entry');
    entry.append(createElement('h3', 'log__title', turn.title));
    for (const section of turn.sections) {
      const block = createElement('div', 'log__section');
      const items = createElement('ul', 'log__items');
      items.append(...section.items.map((item) => createElement('li', undefined, item)));
      block.append(createElement('span', 'log__label', section.label), items);
      entry.append(block);
    }
    this.list.prepend(entry);
  }
}
