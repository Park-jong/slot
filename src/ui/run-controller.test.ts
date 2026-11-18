import { describe, expect, it } from 'vitest';
import type { RunPhase } from '../core';
import { ACTION_ATTACK, M2_RUN } from '../data';
import { definitionWithReels } from '../test-support/run-helpers';
import { RunController, screenForPhase, type Screen, type SeedSource } from './run-controller';

const SAFETY_TURN_LIMIT = 200;
const SEED = 3;
/** Every cell is an attack, so every spin fires all lines and each battle is won within a few turns. */
const ALL_ATTACK = definitionWithReels(['A1 A1 A1', 'A1 A1 A1', 'A1 A1 A1']);

function sequentialSeeds(start: number): SeedSource {
  let next = start;
  return () => next++;
}

/** Spins until the battle ends; returns the number of turns played. */
function playBattle(controller: RunController): number {
  let turns = 0;
  while (controller.screen === 'battle' && turns < SAFETY_TURN_LIMIT) {
    controller.spin();
    turns++;
  }
  return turns;
}

/** Wins battles and skips adds until the edit opportunity. */
function reachEdit(controller: RunController): void {
  while (controller.screen !== 'edit') {
    if (controller.screen === 'battle') playBattle(controller);
    else controller.skipOffer();
  }
}

describe('screenForPhase', () => {
  it('maps every run phase to its screen', () => {
    const phases: RunPhase[] = ['battle', 'reward_add', 'reward_edit', 'victory', 'defeat'];
    expect(phases.map(screenForPhase)).toEqual(['battle', 'reward', 'edit', 'end', 'end']);
  });
});

describe('RunController with the M2 run', () => {
  it('starts at battle 1 with full HP and no events', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    expect(controller.screen).toBe('battle');
    expect(controller.seed).toBe(SEED);
    expect(controller.run.state.stageIndex).toBe(0);
    expect(controller.playerHp).toBe(M2_RUN.character.maxHp);
    expect(controller.lastEvents).toEqual([]);
  });

  it('a seeded run reaches the reward screen after battle 1 with heal and offers, then locks spinning', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    playBattle(controller);
    expect(controller.screen).toBe('reward');
    expect(controller.lastEvents.map((event) => event.type)).toEqual(['battle_won', 'healed', 'offers_drawn']);
    const healed = controller.lastEvents.find((event) => event.type === 'healed');
    expect(controller.playerHp).toBe(healed?.type === 'healed' ? healed.hpAfter : undefined);
    expect(controller.run.state.offers).toHaveLength(M2_RUN.rules.offerCount);
    expect(controller.spin()).toBeNull();
  });

  it('replays the same run for the same seed (one rng per run)', () => {
    const first = new RunController(sequentialSeeds(SEED));
    const second = new RunController(sequentialSeeds(SEED));
    playBattle(first);
    playBattle(second);
    expect(first.run.state).toEqual(second.run.state);
  });

  it('shows the live battle HP while fighting', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    const result = controller.spin();
    expect(controller.playerHp).toBe(result?.report.after.playerHp);
  });
});

describe('RunController cadence (M2 spec 1.2, N = 3)', () => {
  it('battle -> reward x5 with the edit only after battle 3, then the boss and the end screen', () => {
    const controller = new RunController(sequentialSeeds(SEED), ALL_ATTACK);
    const screens: Screen[] = [];
    const record = (): void => {
      screens.push(controller.screen);
    };

    for (let battle = 0; battle < ALL_ATTACK.stages.length; battle++) {
      expect(controller.run.state.stageIndex).toBe(battle);
      playBattle(controller);
      record();
      if (controller.screen !== 'reward') break;
      if (battle === 2) {
        controller.chooseOffer(0, 0);
        record();
        controller.deleteSymbol(0, 3);
        expect(controller.lastEvents.map((event) => event.type)).toEqual(['symbol_deleted']);
      } else {
        controller.skipOffer();
        expect(controller.lastEvents.map((event) => event.type)).toEqual(['add_skipped']);
      }
      record();
    }

    expect(screens).toEqual([
      'reward', 'battle',
      'reward', 'battle',
      'reward', 'edit', 'battle',
      'reward', 'battle',
      'reward', 'battle',
      'end',
    ]);
    expect(controller.run.state.phase).toBe('victory');
    expect(controller.lastEvents.map((event) => event.type)).toEqual(['battle_won', 'run_won']);
  });

  it('enhance and pass also lead to the next battle; restart begins a fresh run with a new seed', () => {
    const controller = new RunController(sequentialSeeds(SEED), ALL_ATTACK);
    reachEdit(controller);
    controller.enhanceSymbol(1, 2);
    expect(controller.screen).toBe('battle');
    expect(controller.run.state.reels[1]?.[2]).toEqual({ actionId: ACTION_ATTACK, grade: 2 });

    controller.restart();
    expect(controller.seed).toBe(SEED + 1);
    expect(controller.run.state).toMatchObject({ phase: 'battle', stageIndex: 0, playerHp: M2_RUN.character.maxHp });
    expect(controller.run.state.reels).toEqual(ALL_ATTACK.character.startingReels);
    expect(controller.lastEvents).toEqual([]);

    reachEdit(controller);
    controller.passEdit();
    expect(controller.lastEvents.map((event) => event.type)).toEqual(['edit_passed']);
    expect(controller.run.state.stageIndex).toBe(3);
  });
});
