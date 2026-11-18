import { createElement } from '../dom';
import { displayHp } from '../format';

const FULL_PERCENT = 100;

/** HP bar with its "HP x / max" text; the modifier picks the side color (player, enemy). */
export class HpBarView {
  readonly bar: HTMLElement;
  readonly text = createElement('span', 'hp-text');
  private readonly fill = createElement('div', 'hp-bar__fill');

  constructor(modifier: string) {
    this.bar = createElement('div', `hp-bar hp-bar--${modifier}`);
    this.bar.append(this.fill);
  }

  update(hp: number, maxHp: number): void {
    const shown = displayHp(hp);
    this.fill.style.width = `${(shown / maxHp) * FULL_PERCENT}%`;
    this.text.textContent = `❤️ HP ${shown} / ${maxHp}`;
  }
}
