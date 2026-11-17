import type { EnemyId } from '../../data';
import { createElement } from '../dom';
import { isEnemyId, type EnemyOption } from '../enemy-options';

/** Enemy dropdown; picking an enemy reports its id, the caller decides what to do (start a battle). */
export class EnemySelector {
  readonly element = createElement('label', 'enemy-selector');
  private readonly select = createElement('select', 'enemy-selector__select');

  constructor(options: readonly EnemyOption[], onSelect: (enemyId: EnemyId) => void) {
    this.select.append(
      ...options.map((option) => {
        const element = createElement('option', undefined, option.name);
        element.value = option.id;
        return element;
      }),
    );
    this.select.addEventListener('change', () => {
      if (isEnemyId(this.select.value)) {
        onSelect(this.select.value);
      }
    });
    this.element.append(createElement('span', 'enemy-selector__label', '상대'), this.select);
  }

  setValue(enemyId: EnemyId): void {
    this.select.value = enemyId;
  }
}
