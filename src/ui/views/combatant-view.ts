import { createElement } from '../dom';
import { displayHp } from '../format';

const FULL_PERCENT = 100;

export interface CombatantStatus {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly guard: number;
}

/** Name, HP bar and guard of one side of the fight. */
export class CombatantView {
  readonly element: HTMLElement;
  private readonly nameLabel = createElement('h2', 'combatant__name');
  private readonly hpFill = createElement('div', 'hp-bar__fill');
  private readonly hpText = createElement('span', 'combatant__hp');
  private readonly guardText = createElement('span', 'combatant__guard');

  constructor(modifier: string) {
    this.element = createElement('section', `panel combatant combatant--${modifier}`);
    const bar = createElement('div', 'hp-bar');
    bar.append(this.hpFill);
    const stats = createElement('div', 'combatant__stats');
    stats.append(this.hpText, this.guardText);
    this.element.append(this.nameLabel, bar, stats);
  }

  update(status: CombatantStatus): void {
    const hp = displayHp(status.hp);
    this.nameLabel.textContent = status.name;
    this.hpFill.style.width = `${(hp / status.maxHp) * FULL_PERCENT}%`;
    this.hpText.textContent = `❤️ HP ${hp} / ${status.maxHp}`;
    this.guardText.textContent = `🛡️ 방어도 ${status.guard}`;
    this.guardText.classList.toggle('combatant__guard--active', status.guard > 0);
  }
}
