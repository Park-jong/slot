// Enemy choices derived from data so new enemies show up in the selector without UI changes.
import { ENEMIES, type EnemyId } from '../data';

export interface EnemyOption {
  readonly id: EnemyId;
  readonly name: string;
}

export function isEnemyId(value: string): value is EnemyId {
  return Object.hasOwn(ENEMIES, value);
}

export function enemyOptions(): EnemyOption[] {
  return Object.values(ENEMIES).map((enemy) => ({ id: enemy.id, name: enemy.name }));
}

export function defaultEnemyId(): EnemyId {
  const [first] = enemyOptions();
  if (!first) {
    throw new Error('enemyOptions: no enemies defined in data');
  }
  return first.id;
}
