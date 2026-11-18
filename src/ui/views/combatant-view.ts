import { createElement } from '../dom';
import { HpBarView } from './hp-bar-view';

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
  private readonly hpBar: HpBarView;
  private readonly guardText = createElement('span', 'combatant__guard');

  constructor(modifier: string) {
    this.element = createElement('section', `panel combatant combatant--${modifier}`);
    this.hpBar = new HpBarView(modifier);
    const stats = createElement('div', 'combatant__stats');
    stats.append(this.hpBar.text, this.guardText);
    this.element.append(this.nameLabel, this.hpBar.bar, stats);
  }

  update(status: CombatantStatus): void {
    this.nameLabel.textContent = status.name;
    this.hpBar.update(status.hp, status.maxHp);
    this.guardText.textContent = `🛡️ 방어도 ${status.guard}`;
    this.guardText.classList.toggle('combatant__guard--active', status.guard > 0);
  }
}
