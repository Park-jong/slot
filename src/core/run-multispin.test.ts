// M2.5 run-level spin phase (m25-multispin-spec 2.2, 5.1, 8.2, 8.3): spinRun / stopRun with the product run.
import { describe, expect, it } from 'vitest';
import { M25_RUN, TURN_RULES } from '../data';
import { withBattleState } from '../test-support/run-helpers';
import { scriptedRng, SINGLE_ATTACK_BOARD } from '../test-support/test-helpers';
import { previewStop, type Battle } from './battle';
import { drawOffers } from './offers';
import { createRng, type Rng } from './rng';
import {
  chooseOffer,
  deleteSymbol,
  enhanceSymbol,
  isRunOver,
  passEdit,
  playRunTurn,
  resolveRunTurn,
  skipOffer,
  spinRun,
  startRun,
  stopRun,
  type Run,
} from './run';

const RNG_CALLS_PER_SPIN = 9;
const OFFER_RNG_CALLS = 3;
const SAFETY_STEP_LIMIT = 2000;
/** 0 always draws the first remaining symbol, so every reel shows A A A: all 8 lines fire. */
const ALL_ATTACK_SPIN = Array.from({ length: RNG_CALLS_PER_SPIN }, () => 0);
const OFFER_VALUES = [0, 0.5, 0.9];
/** Draws the columns A G A / G S A / S A G from A A A G G S S: no line fires. */
const EMPTY_SPIN = [0, 0.34, 0, 0.43, 0.7, 0, 0.75, 0, 0.45];

function battleOf(run: Run): Battle {
  const { battle } = run.state;
  if (!battle) throw new Error('run has no battle');
  return battle;
}

describe('spinRun / stopRun', () => {
  it('startRun has no modifiers and passes the turn rules and modifiers into the battle config', () => {
    const run = startRun(M25_RUN);
    expect(run.state.modifiers).toEqual([]);
    expect(battleOf(run).config).toMatchObject({ turnRules: TURN_RULES, modifiers: [] });
    expect(battleOf(run).session).toEqual({ kind: 'turn_start', stats: { maxSpins: 3, focusPctPerUnused: 50, damagePct: 0 } });
  });

  it('run modifiers reach the next battle (M4 hook)', () => {
    const run = startRun(M25_RUN);
    const withItem: Run = { ...run, state: { ...run.state, modifiers: [{ id: 'extra_hand', spinsPerTurnAdd: 1 }] } };
    const won = stopRun(spinRun(withBattleState(withItem, { enemyHp: 1 }), scriptedRng(ALL_ATTACK_SPIN)).run, createRng(1)).run;
    const next = battleOf(skipOffer(won).run);
    expect(next.config.modifiers).toEqual([{ id: 'extra_hand', spinsPerTurnAdd: 1 }]);
    expect(next.session?.stats.maxSpins).toBe(4);
  });

  it('a spin that does not reach the max keeps the run in battle with no run events (9 rng calls)', () => {
    const rng = scriptedRng(ALL_ATTACK_SPIN);
    const step = spinRun(startRun(M25_RUN), rng);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN);
    expect(step).toMatchObject({ events: [], result: null, spin: { index: 1, maxSpins: 3, empty: false } });
    expect(step.run.state.phase).toBe('battle');
    expect(battleOf(step.run).session?.kind).toBe('spinning');
    expect(step.battleEvents.map((event) => event.type)).toEqual(['turn_started', 'spun']);
  });

  it('stopRun on a win draws the 3 offers and moves to reward_add; stopping itself uses no other rng', () => {
    const spun = spinRun(withBattleState(startRun(M25_RUN), { enemyHp: 1 }), scriptedRng(ALL_ATTACK_SPIN)).run;
    const preview = previewStop(battleOf(spun));
    expect(preview.lethal).toBe(true);
    const rng = scriptedRng(OFFER_VALUES);
    const { run, events, report } = stopRun(spun, rng);
    expect(rng.calls()).toBe(OFFER_RNG_CALLS);
    expect(run.state.phase).toBe('reward_add');
    expect(run.state.offers).toEqual(drawOffers(M25_RUN.rules, 1, scriptedRng(OFFER_VALUES)));
    expect(events[0]).toMatchObject({ type: 'battle_won', stage: 0 });
    expect(report).toMatchObject({ stopReason: 'player_stop', spinsUsed: 1, unusedSpins: 2, focusPct: 100 });
  });

  it('stopRun without a win uses no rng and stays in battle at the next turn_start', () => {
    const spun = spinRun(startRun(M25_RUN), scriptedRng(EMPTY_SPIN)).run;
    const rng = scriptedRng([]);
    const { run, events } = stopRun(spun, rng);
    expect(rng.calls()).toBe(0);
    expect(events).toEqual([]);
    expect(battleOf(run).session?.kind).toBe('turn_start');
    expect(battleOf(run).state.turn).toBe(2);
  });

  it('the spin that reaches the max settles the turn and the run transition in the same call (9 + 3 rng calls)', () => {
    let run = withBattleState(startRun(M25_RUN), { enemyHp: 1 });
    run = spinRun(run, createRng(1)).run;
    run = spinRun(run, createRng(2)).run;
    // Nothing settles during the spin phase, so the enemy is still alive before the third spin.
    expect(battleOf(run).state.enemyHp).toBe(1);
    const rng = scriptedRng([...ALL_ATTACK_SPIN, ...OFFER_VALUES]);
    const step = spinRun(run, rng);
    expect(rng.calls()).toBe(RNG_CALLS_PER_SPIN + OFFER_RNG_CALLS);
    expect(step.result?.report).toMatchObject({ stopReason: 'max_reached', spinsUsed: 3 });
    expect(step.run.state.phase).toBe('reward_add');
    expect(step.events).toEqual(step.result?.events);
    expect(step.battleEvents.map((event) => event.type).slice(0, 2)).toEqual(['spun', 'spin_phase_ended']);
  });

  it('an empty stopped turn at 1 HP moves the run to defeat without rng', () => {
    const nearlyLost = withBattleState(startRun(M25_RUN), { playerHp: 1 });
    const spun = spinRun(nearlyLost, scriptedRng(EMPTY_SPIN)).run;
    expect(previewStop(battleOf(spun))).toMatchObject({ empty: true, playerHpAfterEnemy: -5 });
    const rng = scriptedRng([]);
    const { run, events } = stopRun(spun, rng);
    expect(run.state.phase).toBe('defeat');
    expect(events).toEqual([{ type: 'run_lost', stage: 0 }]);
  });
});

describe('run phase guards with a spin phase (spec 2.2)', () => {
  const start = startRun(M25_RUN);
  const spinning = spinRun(start, createRng(3)).run;

  it('stopRun before any spin throws; playRunTurn and resolveRunTurn throw mid-turn', () => {
    expect(() => stopRun(start, createRng(1))).toThrow(/stopSpinning.*turn_start/);
    expect(() => playRunTurn(spinning, createRng(1))).toThrow(/playTurn.*spinning/);
    expect(() => resolveRunTurn(spinning, SINGLE_ATTACK_BOARD, createRng(1))).toThrow(/resolveTurn.*spinning/);
  });

  it('reward and edit calls throw while spinning (phase is battle)', () => {
    expect(() => chooseOffer(spinning, 0, 0)).toThrow(/requires phase reward_add, run is in battle/);
    expect(() => skipOffer(spinning)).toThrow(/requires phase reward_add/);
    expect(() => deleteSymbol(spinning, 0, 0)).toThrow(/requires phase reward_edit/);
    expect(() => enhanceSymbol(spinning, 0, 0)).toThrow(/requires phase reward_edit/);
    expect(() => passEdit(spinning)).toThrow(/requires phase reward_edit/);
  });

  it('spinRun and stopRun outside the battle phase throw with their own name', () => {
    const rewardAdd = stopRun(spinRun(withBattleState(start, { enemyHp: 1 }), scriptedRng(ALL_ATTACK_SPIN)).run, createRng(1)).run;
    expect(() => spinRun(rewardAdd, createRng(1))).toThrow(/spinRun: requires phase battle, run is in reward_add/);
    expect(() => stopRun(rewardAdd, createRng(1))).toThrow(/stopRun: requires phase battle/);
  });

  it('startRun is always legal', () => {
    expect(startRun(M25_RUN)).toEqual(start);
  });
});

describe('replay (spec 8.3): seed + spin/stop decisions reproduce a run', () => {
  /** Spin while fewer than `target` spins were taken this turn; fixed reward inputs. */
  function playWholeRun(seed: number, target: number) {
    const rng: Rng = createRng(seed);
    let run = startRun(M25_RUN);
    const log: unknown[] = [];
    for (let step = 0; !isRunOver(run); step++) {
      if (step >= SAFETY_STEP_LIMIT) throw new Error('run did not finish');
      if (run.state.phase === 'battle') {
        const session = battleOf(run).session;
        if (session?.kind === 'spinning' && session.spins.length >= target) {
          const result = stopRun(run, rng);
          log.push(result.report.after);
          run = result.run;
        } else {
          const result = spinRun(run, rng);
          log.push(result.spin.board);
          run = result.run;
        }
      } else if (run.state.phase === 'reward_add') {
        run = chooseOffer(run, 0, run.state.stageIndex % run.state.reels.length).run;
      } else {
        run = passEdit(run).run;
      }
    }
    return { run, log };
  }

  it('the same seed and decisions give the same run; different decisions diverge', () => {
    const first = playWholeRun(21, 2);
    const second = playWholeRun(21, 2);
    expect(second.log).toEqual(first.log);
    expect(second.run.state).toEqual(first.run.state);
    expect(playWholeRun(21, 3).log).not.toEqual(first.log);
  });
});
