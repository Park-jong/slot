import { createElement } from '../dom';
import { formatGuard } from '../turn-format';
import { HpBarView } from './hp-bar-view';

export interface CombatantStatus {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly guard: number;
  /** Guard the player would gain by stopping now (U12: guard is only gained at the settlement). */
  readonly pendingGuard?: number;
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
    this.guardText.textContent = formatGuard(status.guard, status.pendingGuard ?? 0);
    this.guardText.classList.toggle('combatant__guard--active', status.guard > 0);
  }
}
