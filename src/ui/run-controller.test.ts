import { describe, expect, it } from 'vitest';
import { previewStop, type RunPhase } from '../core';
import { ACTION_ATTACK, M25_RUN } from '../data';
import { definitionWithReels } from '../test-support/run-helpers';
import { RunController, screenForPhase, type Screen, type SeedSource } from './run-controller';

const SAFETY_TURN_LIMIT = 200;
const SEED = 3;
const MAX_SPINS = M25_RUN.character.spinsPerTurn;
/**
 * M2 character (one spin per turn) where every cell is an attack: every spin fires all lines, settles at once
 * (effective max 1) and each battle is won within a few turns.
 */
const ALL_ATTACK = definitionWithReels(['A1 A1 A1', 'A1 A1 A1', 'A1 A1 A1']);

/** Spins per turn the player takes before stopping (the max settles by itself). */
type Decisions = (turnIndex: number) => number;

function sequentialSeeds(start: number): SeedSource {
  let next = start;
  return () => next++;
}

/** One turn: spin `spins` times (fewer if the max settles first), then stop if still spinning. */
function playTurn(controller: RunController, spins: number): void {
  for (let spin = 0; spin < spins && controller.turn.kind !== 'over'; spin++) {
    const step = controller.spin();
    if (step?.result) return;
  }
  controller.stop();
}

/** Plays turns until the battle ends; returns the number of turns played. */
function playBattle(controller: RunController, decisions: Decisions = () => MAX_SPINS): number {
  let turns = 0;
  while (controller.screen === 'battle' && controller.turn.kind !== 'over' && turns < SAFETY_TURN_LIMIT) {
    playTurn(controller, decisions(turns));
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

describe('RunController with the M2.5 run', () => {
  it('starts at battle 1, turn start with 3 spins, full HP and no events', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    expect(controller.run.definition).toBe(M25_RUN);
    expect(controller.screen).toBe('battle');
    expect(controller.seed).toBe(SEED);
    expect(controller.run.state.stageIndex).toBe(0);
    expect(controller.playerHp).toBe(M25_RUN.character.maxHp);
    expect(controller.lastEvents).toEqual([]);
    expect(controller.lastTurn).toBeNull();
    expect(controller.turn).toEqual({ kind: 'turn_start', stats: { maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 } });
  });

  it('stop is locked at turn start (no spin yet): nothing changes', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    const before = controller.run;
    expect(controller.stop()).toBeNull();
    expect(controller.run).toBe(before);
  });

  it('spin -> spinning with the engine preview and unchanged HP; stop settles with the unused spins as Focus', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    const hpBefore = controller.playerHp;
    const enemyHpBefore = controller.battle?.state.enemyHp;
    const step = controller.spin();
    expect(step?.result).toBeNull();
    expect(step?.spin.index).toBe(1);
    expect(controller.lastEvents).toEqual([]);
    const turn = controller.turn;
    if (turn.kind !== 'spinning') throw new Error(`expected spinning, got ${turn.kind}`);
    expect(turn).toMatchObject({ spinsUsed: 1, remainingSpins: 2 });
    expect(turn.spins.map((spin) => spin.board)).toEqual([step?.spin.board]);
    const battle = controller.battle;
    if (!battle) throw new Error('battle expected');
    expect(turn.preview).toEqual(previewStop(battle));
    expect(turn.estimate?.samples).toBeGreaterThan(0);
    expect(controller.playerHp).toBe(hpBefore);
    expect(battle.state.enemyHp).toBe(enemyHpBefore);
    expect(battle.state.playerGuard).toBe(0);

    const result = controller.stop();
    expect(result?.report).toMatchObject({ spinsUsed: 1, unusedSpins: 2, focusPct: 100, stopReason: 'player_stop' });
    expect(result?.report.after.enemyHp).toBe((enemyHpBefore ?? 0) - turn.preview.totalDamage);
    expect(controller.lastTurn).toBe(result?.report);
    expect(controller.turn.kind).toBe('turn_start');
  });

  it('the third spin settles at the max by itself (no stop needed)', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    expect(controller.spin()?.result).toBeNull();
    expect(controller.spin()?.result).toBeNull();
    const third = controller.spin();
    expect(third?.result?.report).toMatchObject({ spinsUsed: 3, unusedSpins: 0, focusPct: 0, stopReason: 'max_reached' });
    expect(third?.result?.report.spins).toHaveLength(MAX_SPINS);
    expect(controller.lastTurn).toBe(third?.result?.report);
    expect(controller.turn.kind).toBe('turn_start');
  });

  it('a seeded run reaches the reward screen after battle 1 with heal and offers, then locks spin and stop', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    playBattle(controller);
    expect(controller.screen).toBe('reward');
    expect(controller.lastEvents.map((event) => event.type)).toEqual(['battle_won', 'healed', 'offers_drawn']);
    const healed = controller.lastEvents.find((event) => event.type === 'healed');
    expect(controller.playerHp).toBe(healed?.type === 'healed' ? healed.hpAfter : undefined);
    expect(controller.run.state.offers).toHaveLength(M25_RUN.rules.offerCount);
    expect(controller.turn.kind).toBe('over');
    expect(controller.battle).toBeNull();
    expect(controller.spin()).toBeNull();
    expect(controller.stop()).toBeNull();
  });

  it('replays the same run for the same seed and the same spin/stop decisions (one rng per run)', () => {
    const decisions: Decisions = (turn) => (turn % MAX_SPINS) + 1;
    const first = new RunController(sequentialSeeds(SEED));
    const second = new RunController(sequentialSeeds(SEED));
    playBattle(first, decisions);
    playBattle(second, decisions);
    expect(first.run.state).toEqual(second.run.state);
  });

  it('the continue estimate never touches the run rng', () => {
    const withEstimate = new RunController(sequentialSeeds(SEED));
    const withoutEstimate = new RunController(sequentialSeeds(SEED), M25_RUN, null);
    for (const controller of [withEstimate, withoutEstimate]) {
      controller.spin();
      expect(controller.turn.kind).toBe('spinning');
      controller.spin();
      controller.stop();
      controller.spin();
    }
    expect(withoutEstimate.turn.kind === 'spinning' && withoutEstimate.turn.estimate).toBe(null);
    expect(withEstimate.run.state).toEqual(withoutEstimate.run.state);
  });

  it('shows the live battle HP while fighting', () => {
    const controller = new RunController(sequentialSeeds(SEED));
    controller.spin();
    const result = controller.stop();
    expect(controller.playerHp).toBe(result?.report.after.playerHp);
  });
});

describe('RunController with an effective max of 1 (M2.5 spec U9, example 6)', () => {
  it('a single spin settles the turn at once: never spinning, no Focus', () => {
    const controller = new RunController(sequentialSeeds(SEED), ALL_ATTACK);
    expect(controller.turn).toMatchObject({ kind: 'turn_start', stats: { maxSpins: 1 } });
    const step = controller.spin();
    expect(step?.result?.report).toMatchObject({ spinsUsed: 1, unusedSpins: 0, focusPct: 0, stopReason: 'max_reached' });
    expect(controller.turn.kind).not.toBe('spinning');
    expect(controller.stop()).toBeNull();
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
    expect(controller.run.state).toMatchObject({ phase: 'battle', stageIndex: 0, playerHp: ALL_ATTACK.character.maxHp });
    expect(controller.run.state.reels).toEqual(ALL_ATTACK.character.startingReels);
    expect(controller.lastEvents).toEqual([]);
    expect(controller.lastTurn).toBeNull();

    reachEdit(controller);
    controller.passEdit();
    expect(controller.lastEvents.map((event) => event.type)).toEqual(['edit_passed']);
    expect(controller.run.state.stageIndex).toBe(3);
  });
});
