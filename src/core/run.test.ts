import { describe, expect, it } from 'vitest';
import { M2_RUN } from '../data';
import {
  definitionWithReels,
  loseBattle,
  reelSizes,
  symbolCount,
  winBattle,
  withBattleState,
} from '../test-support/run-helpers';
import { reelFromNotation, scriptedRng, SINGLE_ATTACK_BOARD } from '../test-support/test-helpers';
import { spin } from './spin';
import { createRng, type Rng } from './rng';
import { drawOffers } from './offers';
import type { RunEvent } from './events';
import {
  battlesCleared,
  canAddToReel,
  canDeleteFromReel,
  canEnhanceSymbol,
  chooseOffer,
  deleteSymbol,
  editOptions,
  enhanceSymbol,
  isRunOver,
  passEdit,
  playRunTurn,
  resolveRunTurn,
  skipOffer,
  startRun,
  type Run,
  type RunStepResult,
} from './run';
import type { Board, RunDefinition } from './types';

const START_REEL = 'A1 A1 A1 G1 S1 S1';
const FULL_REEL = 'A1 A1 A1 A1 G1 G1 G1 G1 S1 S1 S1 S1';
const SAFETY_TURN_LIMIT = 2000;

/** Wins battles at full HP and skips every add until the run reaches reward_edit (after battle 3). */
function reachEdit(definition: RunDefinition = M2_RUN): Run {
  const rng = createRng(1);
  let run = startRun(definition);
  while (run.state.phase !== 'reward_edit') {
    run = run.state.phase === 'battle' ? winBattle(run, run.state.maxHp, rng).run : skipOffer(run).run;
  }
  return run;
}

/** Wins the current battle and skips the add, landing on the next battle (or reward_edit). */
function clearStage(run: Run, rng: Rng): Run {
  const won = winBattle(run, run.state.maxHp, rng).run;
  return won.state.phase === 'reward_add' ? skipOffer(won).run : won;
}

describe('startRun', () => {
  const run = startRun(M2_RUN);

  it('starts battle 0 (slime) with the M2 starting reels, HP 50 and 18 symbols', () => {
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 0, playerHp: 50, maxHp: 50, offers: null });
    expect(run.state.reels).toEqual([START_REEL, START_REEL, START_REEL].map(reelFromNotation));
    expect(symbolCount(run)).toBe(18);
    expect(run.state.battle?.config.enemy.id).toBe('slime');
    expect(run.state.battle?.state.playerHp).toBe(50);
    expect(battlesCleared(run)).toBe(0);
    expect(isRunOver(run)).toBe(false);
  });

  it('rejects starting reels outside reelMin..reelMax and missing reward tables', () => {
    expect(() => startRun(definitionWithReels(['A1 A1', START_REEL, START_REEL]))).toThrow(/starting reel 0 has 2/);
    expect(() => startRun(definitionWithReels([START_REEL, `${FULL_REEL} A1`, START_REEL]))).toThrow(/starting reel 1 has 13/);
    const { 5: _dropped, ...fourSteps } = M2_RUN.rules.gradeWeightsByCleared;
    const rules = { ...M2_RUN.rules, gradeWeightsByCleared: fourSteps };
    expect(() => startRun({ ...M2_RUN, rules })).toThrow(/no grade weights for 5/);
  });
});

describe('startRun fail-fast data checks', () => {
  const badStage = (patch: object): RunDefinition => ({
    ...M2_RUN,
    stages: [...M2_RUN.stages.slice(0, -1), { ...M2_RUN.stages[M2_RUN.stages.length - 1]!, ...patch }],
  });

  it('rejects an invalid boss pattern or hp before the run starts', () => {
    expect(() => startRun(badStage({ pattern: [] }))).toThrow(/empty pattern/);
    expect(() => startRun(badStage({ pattern: [{ type: 'charge', value: 1 }] }))).toThrow(/charge multiplier/);
    expect(() => startRun(badStage({ pattern: [{ type: 'heal', value: 5 }] }))).toThrow(/unknown intent type/);
    expect(() => startRun(badStage({ pattern: [{ type: 'attack', value: 0 }] }))).toThrow(/must be a positive integer/);
    expect(() => startRun(badStage({ hp: 0 }))).toThrow(/hp 0/);
  });

  it('rejects reward tables that name an unknown action or grade', () => {
    const unknownAction = { ...M2_RUN.rules, actionWeights: [...M2_RUN.rules.actionWeights, { actionId: 'fireball', weight: 10 }] };
    expect(() => startRun({ ...M2_RUN, rules: unknownAction })).toThrow(/reward action fireball/);
    const unknownGrade = { ...M2_RUN.rules, gradeWeightsByCleared: { ...M2_RUN.rules.gradeWeightsByCleared, 1: [{ grade: 9, weight: 5 }] } };
    expect(() => startRun({ ...M2_RUN, rules: unknownGrade })).toThrow(/reward grade 9/);
  });
});

describe('M2 example 1a in a run: offers drawn on entering reward_add', () => {
  it('rng [0, 0.5, 0.999] after battle 1 -> offers attack(1), guard(2), shield_bash(2), 3 rng calls', () => {
    const rng = scriptedRng([0, 0.5, 0.999]);
    const { run, events } = winBattle(startRun(M2_RUN), 50, rng);
    const offers = [
      { actionId: 'attack', grade: 1 },
      { actionId: 'guard', grade: 2 },
      { actionId: 'shield_bash', grade: 2 },
    ];
    expect(run.state.offers).toEqual(offers);
    expect(events.at(-1)).toEqual({ type: 'offers_drawn', offers });
    expect(rng.calls()).toBe(3);
  });
});

describe('M2 example 1b: add attack(2) to reel 2', () => {
  // rng 0.35 -> r = 3500 at k = 1: attack1 (3200) -> 300, attack2 (800) -> -500, so attack(2) is offer 0.
  const offered = winBattle(startRun(M2_RUN), 50, scriptedRng([0.35, 0, 0])).run;
  const { run, events } = chooseOffer(offered, 0, 2);

  it('appends it at the end: reel 2 = A1 A1 A1 G1 S1 S1 A2, sizes [6, 6, 7]', () => {
    expect(offered.state.offers?.[0]).toEqual({ actionId: 'attack', grade: 2 });
    expect(run.state.reels[2]).toEqual(reelFromNotation('A1 A1 A1 G1 S1 S1 A2'));
    expect(reelSizes(run)).toEqual([6, 6, 7]);
    expect(events).toEqual([{ type: 'symbol_added', reelIndex: 2, symbol: { actionId: 'attack', grade: 2 } }]);
  });

  it('k = 1 has no edit: the next battle (stage 1) spins the new reels', () => {
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 1, offers: null });
    expect(run.state.battle?.config.reels).toBe(run.state.reels);
  });

  it('rejects bad offer and reel indices', () => {
    expect(() => chooseOffer(offered, 3, 0)).toThrow(/offer index 3/);
    expect(() => chooseOffer(offered, 0, 3)).toThrow(/reel index 3/);
    expect(() => chooseOffer(offered, -1, 0)).toThrow(/offer index -1/);
  });
});

describe('M2 example 2: delete reel 1 G1', () => {
  const editing = reachEdit();
  const { run, events } = deleteSymbol(editing, 1, 3);

  it('reel 1 = A1 A1 A1 S1 S1 (5 symbols), event symbol_deleted(1, 3, guard 1)', () => {
    expect(run.state.reels[1]).toEqual(reelFromNotation('A1 A1 A1 S1 S1'));
    expect(reelSizes(run)).toEqual([6, 5, 6]);
    expect(events).toEqual([{ type: 'symbol_deleted', reelIndex: 1, symbolIndex: 3, symbol: { actionId: 'guard', grade: 1 } }]);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 3 });
  });

  it('deleting from a reel of 3 throws; other reels stay deletable', () => {
    const run3 = reachEdit(definitionWithReels(['A1 G1 S1', START_REEL, START_REEL]));
    expect(canDeleteFromReel(run3, 0)).toBe(false);
    expect(canDeleteFromReel(run3, 1)).toBe(true);
    expect(() => deleteSymbol(run3, 0, 0)).toThrow(/minimum of 3/);
    expect(() => deleteSymbol(editing, 1, 6)).toThrow(/symbol index 6/);
  });

  it('all reels at 3: delete is disabled, enhance still offered', () => {
    const run3 = reachEdit(definitionWithReels(['A1 G1 S1', 'A1 G1 S1', 'A1 G1 S1']));
    expect(editOptions(run3)).toEqual({ canDelete: false, canEnhance: true });
  });
});

describe('M2 example 3: enhance reel 2 S1 -> S2', () => {
  const editing = reachEdit();
  const { run, events } = enhanceSymbol(editing, 2, 4);

  it('only the chosen index changes, in place: reel 2 = A1 A1 A1 G1 S2 S1', () => {
    expect(run.state.reels[2]).toEqual(reelFromNotation('A1 A1 A1 G1 S2 S1'));
    expect(reelSizes(run)).toEqual([6, 6, 6]);
    expect(events).toEqual([
      {
        type: 'symbol_enhanced',
        reelIndex: 2,
        symbolIndex: 4,
        from: { actionId: 'shield_bash', grade: 1 },
        to: { actionId: 'shield_bash', grade: 2 },
      },
    ]);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 3 });
  });

  it('enhancing a hero (grade 4) throws', () => {
    const heroRun = reachEdit(definitionWithReels(['A4 A1 A1 G1 S1 S1', START_REEL, START_REEL]));
    expect(canEnhanceSymbol(heroRun, 0, 0)).toBe(false);
    expect(canEnhanceSymbol(heroRun, 0, 1)).toBe(true);
    expect(() => enhanceSymbol(heroRun, 0, 0)).toThrow(/already the highest/);
    expect(() => enhanceSymbol(heroRun, -1, 0)).toThrow(/reel index -1/);
  });
});

describe('M2 example 5: one run across the N = 3 boundary', () => {
  const rng = createRng(5);
  const steps: { run: Run; events: readonly RunEvent[] }[] = [];
  let run = startRun(M2_RUN);
  const record = (result: { run: Run; events: readonly RunEvent[] }) => {
    steps.push(result);
    run = result.run;
    return result;
  };
  const types = (events: readonly RunEvent[]) => events.map((event) => event.type);

  it('1: startRun -> battle(0 slime), HP 50, 18 symbols', () => {
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 0, playerHp: 50 });
    expect(symbolCount(run)).toBe(18);
  });

  it('2-3: win at 36 -> healed +8 -> 44, reward_add(k = 1); add -> battle(1), HP 44, 19 symbols', () => {
    const won = record(winBattle(run, 36, rng));
    expect(won.events.slice(0, 2)).toEqual([
      { type: 'battle_won', stage: 0, hpAfter: 36 },
      { type: 'healed', amount: 8, hpAfter: 44 },
    ]);
    expect(types(won.events)).toEqual(['battle_won', 'healed', 'offers_drawn']);
    expect(run.state).toMatchObject({ phase: 'reward_add', playerHp: 44, battle: null });
    expect(battlesCleared(run)).toBe(1);
    record(chooseOffer(run, 0, 0));
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 1, playerHp: 44 });
    expect(run.state.battle?.state).toMatchObject({ playerHp: 44, playerGuard: 0, enemyChargeMult: 1 });
    expect(run.state.battle?.config.enemy.id).toBe('goblin_young');
    expect(symbolCount(run)).toBe(19);
  });

  it('4-5: win at 30 -> 38, reward_add(k = 2); skip -> add_skipped, battle(2), 19 symbols', () => {
    record(winBattle(run, 30, rng));
    expect(run.state).toMatchObject({ phase: 'reward_add', playerHp: 38 });
    expect(battlesCleared(run)).toBe(2);
    expect(record(skipOffer(run)).events).toEqual([{ type: 'add_skipped' }]);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 2, playerHp: 38 });
    expect(symbolCount(run)).toBe(19);
  });

  it('6-8: win at 28 -> 36; add -> reward_edit(k = 3), 20 symbols; delete -> battle(3), 19 symbols, HP 36', () => {
    record(winBattle(run, 28, rng));
    expect(run.state).toMatchObject({ phase: 'reward_add', playerHp: 36 });
    expect(types(record(chooseOffer(run, 0, 1)).events)).toEqual(['symbol_added']);
    expect(run.state.phase).toBe('reward_edit');
    expect(battlesCleared(run)).toBe(3);
    expect(symbolCount(run)).toBe(20);
    expect(types(record(deleteSymbol(run, 2, 3)).events)).toEqual(['symbol_deleted']);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 3, playerHp: 36 });
    expect(symbolCount(run)).toBe(19);
  });

  it('9-10: win at 46 -> +8 capped to 50 (actual +4), reward_add(k = 4); add -> battle(4), 20 symbols', () => {
    const won = record(winBattle(run, 46, rng));
    expect(won.events[1]).toEqual({ type: 'healed', amount: 4, hpAfter: 50 });
    expect(run.state.phase).toBe('reward_add');
    record(chooseOffer(run, 0, 2));
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 4, playerHp: 50 });
    expect(symbolCount(run)).toBe(20);
  });

  it('11-12: win at 20 -> full heal (+30) -> 50, reward_add(k = 5); skip -> boss, 20 symbols, HP 50', () => {
    const won = record(winBattle(run, 20, rng));
    expect(won.events[1]).toEqual({ type: 'healed', amount: 30, hpAfter: 50 });
    expect(battlesCleared(run)).toBe(5);
    record(skipOffer(run));
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 5, playerHp: 50 });
    expect(run.state.battle?.config.enemy.id).toBe('ogre');
    expect(symbolCount(run)).toBe(20);
  });

  it('13: boss win -> run_won, victory, no heal and no reward', () => {
    const won = record(winBattle(run, 27, rng));
    expect(won.events).toEqual([{ type: 'battle_won', stage: 5, hpAfter: 27 }, { type: 'run_won' }]);
    expect(run.state).toMatchObject({ phase: 'victory', stageIndex: 5, playerHp: 27, offers: null });
    expect(run.state.battle?.state.phase).toBe('victory');
    expect(isRunOver(run)).toBe(true);
    expect(battlesCleared(run)).toBe(6);
  });

  it('only battle 3 opened reward_edit', () => {
    const editPhases = steps.filter((step) => step.run.state.phase === 'reward_edit');
    expect(editPhases).toHaveLength(1);
  });
});

describe('defeat and restart', () => {
  it('losing battle 2 (stage 1) -> run_lost(1), defeat records the stage and final reels', () => {
    const rng = createRng(3);
    const offered = winBattle(startRun(M2_RUN), 40, rng).run;
    const added = chooseOffer(offered, 0, 1).run;
    const { run, events } = loseBattle(added, rng);
    expect(events).toEqual([{ type: 'run_lost', stage: 1 }]);
    expect(run.state).toMatchObject({ phase: 'defeat', stageIndex: 1 });
    expect(run.state.reels).toBe(added.state.reels);
    expect(reelSizes(run)).toEqual([6, 7, 6]);
    expect(run.state.battle?.state.phase).toBe('defeat');
    expect(run.state.playerHp).toBeLessThanOrEqual(0);
    expect(isRunOver(run)).toBe(true);
  });

  it('startRun after a defeat resets reels to 18 symbols, HP 50, battle(0)', () => {
    const rng = createRng(4);
    const lost = loseBattle(chooseOffer(winBattle(startRun(M2_RUN), 30, rng).run, 0, 0).run, rng).run;
    const restarted = startRun(lost.definition);
    expect(restarted).toEqual(startRun(M2_RUN));
    expect(symbolCount(restarted)).toBe(18);
    expect(restarted.state).toMatchObject({ phase: 'battle', stageIndex: 0, playerHp: 50 });
  });
});

describe('reward edge cases', () => {
  it('winning at full HP still emits healed with amount 0', () => {
    const { events } = winBattle(startRun(M2_RUN), 50, createRng(1));
    expect(events[1]).toEqual({ type: 'healed', amount: 0, hpAfter: 50 });
  });

  it('a reel at 12 cannot take an add; other reels can', () => {
    const offered = winBattle(startRun(definitionWithReels([FULL_REEL, START_REEL, START_REEL])), 50, createRng(1)).run;
    expect(canAddToReel(offered, 0)).toBe(false);
    expect(canAddToReel(offered, 1)).toBe(true);
    expect(() => chooseOffer(offered, 0, 0)).toThrow(/maximum of 12/);
    expect(reelSizes(chooseOffer(offered, 0, 1).run)).toEqual([12, 7, 6]);
  });

  it('all reels at 12: reward_add is skipped automatically without drawing offers', () => {
    const noDraws = scriptedRng([]);
    const { run, events } = winBattle(startRun(definitionWithReels([FULL_REEL, FULL_REEL, FULL_REEL])), 50, noDraws);
    expect(events.map((event) => event.type)).toEqual(['battle_won', 'healed', 'add_skipped']);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 1, offers: null });
    expect(noDraws.calls()).toBe(0);
  });

  it('all reels at 12 at k = 3: auto skip, then reward_edit (delete is possible)', () => {
    const rng = createRng(2);
    let run = startRun(definitionWithReels([FULL_REEL, FULL_REEL, FULL_REEL]));
    run = clearStage(clearStage(run, rng), rng);
    const { run: atEdit, events } = winBattle(run, 50, rng);
    expect(events.map((event) => event.type)).toEqual(['battle_won', 'healed', 'add_skipped']);
    expect(atEdit.state.phase).toBe('reward_edit');
  });

  it('delete and enhance both impossible: reward_edit passes automatically', () => {
    const rng = createRng(6);
    let run = startRun(definitionWithReels(['A4 G4 S4', 'A4 G4 S4', 'A4 G4 S4']));
    run = clearStage(clearStage(run, rng), rng);
    const offered = winBattle(run, 50, rng).run;
    expect(offered.state.phase).toBe('reward_add');
    const { run: next, events } = skipOffer(offered);
    expect(events).toEqual([{ type: 'add_skipped' }, { type: 'edit_passed' }]);
    expect(next.state).toMatchObject({ phase: 'battle', stageIndex: 3 });
  });

  it('adding to a 3-symbol reel re-enables delete, so reward_edit is offered', () => {
    const rng = createRng(6);
    let run = startRun(definitionWithReels(['A4 G4 S4', 'A4 G4 S4', 'A4 G4 S4']));
    run = clearStage(clearStage(run, rng), rng);
    const { run: editing } = chooseOffer(winBattle(run, 50, rng).run, 0, 0);
    expect(editing.state.phase).toBe('reward_edit');
    expect(editOptions(editing).canDelete).toBe(true);
  });

  it('passing the edit gives nothing and leaves the reels as they were', () => {
    const editing = reachEdit();
    const { run, events } = passEdit(editing);
    expect(events).toEqual([{ type: 'edit_passed' }]);
    expect(run.state.reels).toBe(editing.state.reels);
    expect(run.state).toMatchObject({ phase: 'battle', stageIndex: 3 });
  });
});

describe('phase guards', () => {
  const rng = createRng(1);
  const battle = startRun(M2_RUN);
  const rewardAdd = winBattle(battle, 50, rng).run;
  const rewardEdit = reachEdit();
  const victory = { ...rewardEdit, state: { ...rewardEdit.state, phase: 'victory' as const } };
  const defeat = loseBattle(battle, rng).run;

  it('battle phase rejects reward calls', () => {
    expect(() => chooseOffer(battle, 0, 0)).toThrow(/requires phase reward_add, run is in battle/);
    expect(() => skipOffer(battle)).toThrow(/requires phase reward_add/);
    expect(() => deleteSymbol(battle, 0, 0)).toThrow(/requires phase reward_edit/);
    expect(() => enhanceSymbol(battle, 0, 0)).toThrow(/requires phase reward_edit/);
    expect(() => passEdit(battle)).toThrow(/requires phase reward_edit/);
  });

  it('reward_add rejects turns and edit calls', () => {
    expect(() => playRunTurn(rewardAdd, rng)).toThrow(/requires phase battle, run is in reward_add/);
    expect(() => resolveRunTurn(rewardAdd, SINGLE_ATTACK_BOARD, rng)).toThrow(/requires phase battle/);
    expect(() => deleteSymbol(rewardAdd, 0, 0)).toThrow(/requires phase reward_edit/);
    expect(() => passEdit(rewardAdd)).toThrow(/requires phase reward_edit/);
  });

  it('reward_edit rejects turns and add calls', () => {
    expect(() => playRunTurn(rewardEdit, rng)).toThrow(/requires phase battle/);
    expect(() => chooseOffer(rewardEdit, 0, 0)).toThrow(/requires phase reward_add/);
    expect(() => skipOffer(rewardEdit)).toThrow(/requires phase reward_add/);
  });

  it('victory and defeat accept nothing but a new startRun', () => {
    for (const ended of [victory, defeat]) {
      expect(() => playRunTurn(ended, rng)).toThrow(/requires phase battle/);
      expect(() => chooseOffer(ended, 0, 0)).toThrow(/requires phase/);
      expect(() => skipOffer(ended)).toThrow(/requires phase/);
      expect(() => deleteSymbol(ended, 0, 0)).toThrow(/requires phase/);
      expect(() => enhanceSymbol(ended, 0, 0)).toThrow(/requires phase/);
      expect(() => passEdit(ended)).toThrow(/requires phase/);
    }
  });
});

describe('randomness and reproducibility', () => {
  /** A fixed input policy so a run is a function of the seed only. */
  function playWholeRun(seed: number) {
    const rng = createRng(seed);
    let run = startRun(M2_RUN);
    const log: unknown[] = [];
    for (let step = 0; !isRunOver(run); step++) {
      if (step >= SAFETY_TURN_LIMIT) throw new Error('run did not finish');
      const result = nextInput(run, rng);
      log.push(result.events, result.board);
      run = result.run;
    }
    return { run, log };
  }

  function nextInput(run: Run, rng: Rng): RunStepResult & { readonly board: Board | null } {
    switch (run.state.phase) {
      case 'battle': {
        const { report, ...step } = playRunTurn(run, rng);
        return { ...step, board: report.board };
      }
      case 'reward_add':
        return { ...chooseOffer(run, 0, run.state.stageIndex % run.state.reels.length), board: null };
      case 'reward_edit':
        return { ...(editOptions(run).canDelete ? deleteSymbol(run, 0, 0) : passEdit(run)), board: null };
      default:
        throw new Error(`no input for ${run.state.phase}`);
    }
  }

  it('the same seed and inputs replay the whole run exactly', () => {
    const first = playWholeRun(77);
    const second = playWholeRun(77);
    expect(second.log).toEqual(first.log);
    expect(second.run.state).toEqual(first.run.state);
  });

  it('a winning turn consumes the rng as 9 spin calls, then 3 offer calls', () => {
    for (let seed = 1; seed < 100; seed++) {
      const values: number[] = [];
      const source = createRng(seed);
      const recording: Rng = () => {
        const value = source();
        values.push(value);
        return value;
      };
      const nearlyWon = withBattleState(startRun(M2_RUN), { enemyHp: 1 });
      const { run, report } = playRunTurn(nearlyWon, recording);
      if (run.state.phase !== 'reward_add') continue;
      expect(values).toHaveLength(12);
      expect(report.board).toEqual(spin(nearlyWon.state.reels, scriptedRng(values.slice(0, 9))));
      expect(run.state.offers).toEqual(drawOffers(M2_RUN.rules, 1, scriptedRng(values.slice(9))));
      return;
    }
    throw new Error('no seed produced a winning turn');
  });
});
