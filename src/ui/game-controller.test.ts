import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data';
import { enemyOptions, isEnemyId } from './enemy-options';
import { GameController, type SeedSource } from './game-controller';

const SAFETY_TURN_LIMIT = 200;

function sequentialSeeds(start: number): SeedSource {
  let next = start;
  return () => next++;
}

function playToEnd(controller: GameController): number {
  let turns = 0;
  while (controller.spin() && turns < SAFETY_TURN_LIMIT) {
    turns++;
  }
  return turns;
}

describe('GameController', () => {
  it('replays the same battle for the same seed', () => {
    const first = new GameController(sequentialSeeds(42), 'slime');
    const second = new GameController(sequentialSeeds(42), 'slime');
    playToEnd(first);
    playToEnd(second);
    expect(first.reports).toEqual(second.reports);
    expect(first.battle.state).toEqual(second.battle.state);
  });

  it('locks input once the battle is over', () => {
    const controller = new GameController(sequentialSeeds(7), 'goblin');
    const turns = playToEnd(controller);
    expect(turns).toBeLessThan(SAFETY_TURN_LIMIT);
    expect(controller.isOver).toBe(true);
    expect(controller.spin()).toBeNull();
    expect(controller.reports).toHaveLength(turns);
  });

  it('restarts with a fresh seed and empty history, optionally against another enemy', () => {
    const controller = new GameController(sequentialSeeds(1), 'slime');
    controller.spin();
    controller.start();
    expect(controller.seed).toBe(2);
    expect(controller.reports).toHaveLength(0);
    expect(controller.battle.state.turn).toBe(1);
    expect(controller.enemyId).toBe('slime');

    controller.start('goblin');
    expect(controller.enemyId).toBe('goblin');
    expect(controller.battle.state.enemyHp).toBe(ENEMIES.goblin.hp);
  });
});

describe('enemyOptions', () => {
  it('lists every enemy from data with its name', () => {
    expect(enemyOptions()).toEqual(Object.values(ENEMIES).map(({ id, name }) => ({ id, name })));
    expect(isEnemyId('slime')).toBe(true);
    expect(isEnemyId('dragon')).toBe(false);
  });
});
