import { beforeAll, describe, expect, it } from 'vitest';
import { M25_RUN } from '../data';
import { simulateMultispinRuns, type MultispinBalanceResult, type StageStats } from '../test-support/multispin-balance-sim';

// Fast M2.5 whole-run balance check on the production engine (spinRun/stopRun + M25_RUN), played by the policies
// of design's reference simulator tools/sim/ms-sim.mjs. Same seed + chunking => the production engine and the
// design simulator draw the same random numbers, so win counts and per-stage tallies must match EXACTLY
// (hard-coded below from design's simulate()). The full-size version is balance.multispin.full.test.ts.
const SEED = 1;
const FIRST_STAGE = 0;
const PERCENT = 100;
const HOOK_TIMEOUT_MS = 120_000;

// ---- design reference tallies (ms-sim.mjs simulate(), seed 1, 40 chunks) ----
const DESIGN_MAX_GREEDY = {
  runs: 2000,
  wins: 910,
  turns: [12501, 10166, 10539, 5991, 5084, 7851],
  emptyTurns: [1114, 769, 654, 227, 149, 169],
  spins: [37503, 30498, 31617, 17973, 15252, 23553],
  emptySpins: [16717, 12859, 12425, 6030, 4702, 6642],
  deaths: [0, 74, 202, 289, 261, 264],
};
const DESIGN_SMART_GREEDY = {
  runs: 300,
  wins: 188,
  turns: [1645, 1429, 1502, 866, 826, 1331],
  emptyTurns: [161, 93, 105, 25, 24, 25],
  earlyStops: [349, 327, 315, 319, 301, 543],
};
const DESIGN_ONCE_GREEDY = { runs: 1000, wins: 0, turns: [11409, 3854, 1237, 184, 64, 21] };
const DESIGN_SMART_NONE = { runs: 300, wins: 0, turns: [1655, 1698, 2291, 1071, 589, 289] };

// ---- spec m25-multispin 11.1 / 9 (AC-9.2) ----
const SPEC_MAX_GREEDY_WIN_RATE = 0.458;
const SPEC_MAX_GREEDY_TOLERANCE = 0.03;
const MAX_WIN_RATE_FOR_WEAK_POLICY = 0.01;
const BOSS_EMPTY_TURN_MIN = 0.01;
const BOSS_EMPTY_TURN_MAX = 0.04;
const FIRST_STAGE_EMPTY_TURN_MIN = 0.07;
const FIRST_STAGE_EMPTY_TURN_MAX = 0.11;
const BOSS_EMPTY_SPIN_MIN = 0.25;
const BOSS_EMPTY_SPIN_MAX = 0.35;

// ---- Focus-less control (spec 11.5) ----
const CONTROL_RUNS = 300;
const NO_FOCUS_RUN = { ...M25_RUN, rules: { ...M25_RUN.rules, focusPercentPerUnusedSpin: 0 } };

const column = (r: MultispinBalanceResult, pick: (s: StageStats) => number): number[] => r.stages.map(pick);
const emptyTurnRate = (s: StageStats): number => s.emptyTurns / s.turns;
const lastStage = (r: MultispinBalanceResult): StageStats => r.stages[r.stages.length - 1] as StageStats;

describe('M2.5 run balance on the production engine (fast)', () => {
  let maxGreedy: MultispinBalanceResult;
  let smartGreedy: MultispinBalanceResult;
  let onceGreedy: MultispinBalanceResult;
  let smartNone: MultispinBalanceResult;

  beforeAll(() => {
    maxGreedy = simulateMultispinRuns({ stop: 'max', edit: 'greedy', runs: DESIGN_MAX_GREEDY.runs, seed: SEED });
    smartGreedy = simulateMultispinRuns({ stop: 'smart', edit: 'greedy', runs: DESIGN_SMART_GREEDY.runs, seed: SEED });
    onceGreedy = simulateMultispinRuns({ stop: 'once', edit: 'greedy', runs: DESIGN_ONCE_GREEDY.runs, seed: SEED });
    smartNone = simulateMultispinRuns({ stop: 'smart', edit: 'none', runs: DESIGN_SMART_NONE.runs, seed: SEED });
  }, HOOK_TIMEOUT_MS);

  describe('same-seed exact match with design ms-sim.mjs', () => {
    it('max stop + greedy editor: win count equals design', () => {
      expect(maxGreedy.wins).toBe(DESIGN_MAX_GREEDY.wins);
    });

    it('max stop + greedy editor: per-stage turns equal design', () => {
      expect(column(maxGreedy, (s) => s.turns)).toEqual(DESIGN_MAX_GREEDY.turns);
    });

    it('max stop + greedy editor: per-stage empty turns equal design', () => {
      expect(column(maxGreedy, (s) => s.emptyTurns)).toEqual(DESIGN_MAX_GREEDY.emptyTurns);
    });

    it('max stop + greedy editor: per-stage spins and empty spins equal design', () => {
      expect(column(maxGreedy, (s) => s.spins)).toEqual(DESIGN_MAX_GREEDY.spins);
      expect(column(maxGreedy, (s) => s.emptySpins)).toEqual(DESIGN_MAX_GREEDY.emptySpins);
    });

    it('max stop + greedy editor: deaths by stage equal design', () => {
      expect(maxGreedy.deaths).toEqual(DESIGN_MAX_GREEDY.deaths);
    });

    it('smart stop + greedy editor: win count equals design', () => {
      expect(smartGreedy.wins).toBe(DESIGN_SMART_GREEDY.wins);
    });

    it('smart stop + greedy editor: per-stage turns, empty turns and early stops equal design', () => {
      expect(column(smartGreedy, (s) => s.turns)).toEqual(DESIGN_SMART_GREEDY.turns);
      expect(column(smartGreedy, (s) => s.emptyTurns)).toEqual(DESIGN_SMART_GREEDY.emptyTurns);
      expect(column(smartGreedy, (s) => s.earlyStops)).toEqual(DESIGN_SMART_GREEDY.earlyStops);
    });

    it('once stop + greedy editor: wins and per-stage turns equal design', () => {
      expect(onceGreedy.wins).toBe(DESIGN_ONCE_GREEDY.wins);
      expect(column(onceGreedy, (s) => s.turns)).toEqual(DESIGN_ONCE_GREEDY.turns);
    });

    it('smart stop + no editing: wins and per-stage turns equal design', () => {
      expect(smartNone.wins).toBe(DESIGN_SMART_NONE.wins);
      expect(column(smartNone, (s) => s.turns)).toEqual(DESIGN_SMART_NONE.turns);
    });
  });

  describe('spec 11.1 and 9 bands', () => {
    it('max stop + greedy win rate is within 3pp of the spec 45.8%', () => {
      expect(Math.abs(maxGreedy.winRate - SPEC_MAX_GREEDY_WIN_RATE)).toBeLessThanOrEqual(
        SPEC_MAX_GREEDY_TOLERANCE,
      );
    });

    it('once stop + greedy almost never clears the run (<= 1%)', () => {
      expect(onceGreedy.winRate).toBeLessThanOrEqual(MAX_WIN_RATE_FOR_WEAK_POLICY);
    });

    it('smart stop without editing almost never clears the run (<= 1%)', () => {
      expect(smartNone.winRate).toBeLessThanOrEqual(MAX_WIN_RATE_FOR_WEAK_POLICY);
    });

    it('boss empty-turn rate is 1-4% (AC-9.2)', () => {
      const rate = emptyTurnRate(lastStage(maxGreedy));
      expect(rate).toBeGreaterThanOrEqual(BOSS_EMPTY_TURN_MIN);
      expect(rate).toBeLessThanOrEqual(BOSS_EMPTY_TURN_MAX);
    });

    it('stage-1 empty-turn rate is 7-11% (AC-9.2)', () => {
      const rate = emptyTurnRate(maxGreedy.stages[FIRST_STAGE] as StageStats);
      expect(rate).toBeGreaterThanOrEqual(FIRST_STAGE_EMPTY_TURN_MIN);
      expect(rate).toBeLessThanOrEqual(FIRST_STAGE_EMPTY_TURN_MAX);
    });

    it('boss empty-spin rate is 25-35% (AC-9.2)', () => {
      expect(maxGreedy.bossEmptySpinRate).toBeGreaterThanOrEqual(BOSS_EMPTY_SPIN_MIN);
      expect(maxGreedy.bossEmptySpinRate).toBeLessThanOrEqual(BOSS_EMPTY_SPIN_MAX);
    });

    it('max stop never stops early and uses every spin of the turn', () => {
      expect(maxGreedy.earlyStopRate).toBe(0);
      expect(maxGreedy.spinsPerTurn).toBe(M25_RUN.character.spinsPerTurn);
    });

    it('smart stop stops early sometimes, so it uses fewer spins per turn than max', () => {
      expect(smartGreedy.earlyStopRate).toBeGreaterThan(0);
      expect(smartGreedy.spinsPerTurn).toBeLessThan(maxGreedy.spinsPerTurn);
      console.info(
        `smart early ${(smartGreedy.earlyStopRate * PERCENT).toFixed(1)}%, non-lethal ${(smartGreedy.nonLethalStopRate * PERCENT).toFixed(1)}%`,
      );
    });
  });

  describe('Focus-less control (spec 11.5)', () => {
    it('with Focus 0 stopping early cannot change the outcome: smart and max give the same win count and deaths', () => {
      const smart = simulateMultispinRuns({ stop: 'smart', edit: 'takeall', runs: CONTROL_RUNS, seed: SEED, definition: NO_FOCUS_RUN });
      const max = simulateMultispinRuns({ stop: 'max', edit: 'takeall', runs: CONTROL_RUNS, seed: SEED, definition: NO_FOCUS_RUN });
      expect(smart.earlyStopRate).toBeGreaterThan(0);
      expect(smart.wins).toBe(max.wins);
      expect(smart.deaths).toEqual(max.deaths);
    });
  });
});
