// M2 spec coverage gaps found while mapping spec 1, 2.2 and 9 onto the existing tests (QA pass, like spec-gaps.test.ts).
import { describe, expect, it } from 'vitest';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, M2_RUN, RUN_RULES, STAGES } from '../data';
import { loseBattle, reelSizes, symbolCount, winBattle, withBattleState } from '../test-support/run-helpers';
import { boardFromRows, scriptedRng } from '../test-support/test-helpers';
import { createBattle, resolveTurn } from './battle';
import { drawOffers } from './offers';
import { createRng, type Rng } from './rng';
import {
  chooseOffer,
  deleteSymbol,
  editOptions,
  enhanceSymbol,
  isRunOver,
  passEdit,
  playRunTurn,
  skipOffer,
  startRun,
  type Run,
} from './run';
import type { RunEvent } from './events';
import type { ReelSymbol } from './types';

const BOSS_STAGE = STAGES.length - 1;
const REGULAR_BATTLES = BOSS_STAGE;
const EDIT_AFTER_CLEARED = 3;
const MAX_HP = 50;
const HEAL_AMOUNT = 8;
const SAFETY_TURN_LIMIT = 500;
const REEL_MAX_IN_M2 = 11; // spec 1.4: start 6 + at most 5 adds
const REEL_MIN = 3;

function eventTypes(events: readonly RunEvent[]): string[] {
  return events.map((event) => event.type);
}

/** Clears stages (win at full HP, skip adds, pass edits) until the run is in `stage` battling. */
function advanceToStage(stage: number): Run {
  const rng = createRng(7);
  let run = startRun(M2_RUN);
  while (run.state.stageIndex < stage) {
    const phase = run.state.phase;
    if (phase === 'battle') run = winBattle(run, MAX_HP, rng).run;
    else if (phase === 'reward_add') run = skipOffer(run).run;
    else run = passEdit(run).run;
  }
  return run;
}

describe('M2 example 3: enhanced symbol power in a battle', () => {
  const newBattle = () => (startRun(M2_RUN).state.battle as NonNullable<Run['state']['battle']>);
  const horizontalSkill = (grades: string) => boardFromRows([grades, 'A1 G1 A1', 'G1 A1 G1']);

  it('S1 S1 S2 (grade sum 4) deals 4 damage and gives 4 guard', () => {
    const { report } = resolveTurn(newBattle(), horizontalSkill('S1 S1 S2'));
    const damage = report.events.find((event) => event.type === 'enemy_damaged');
    const guard = report.events.find((event) => event.type === 'player_guard_gained');
    expect(damage).toMatchObject({ actionId: ACTION_SHIELD_BASH, damage: 4 });
    expect(guard).toMatchObject({ actionId: ACTION_SHIELD_BASH, amount: 4 });
  });

  it('S1 S1 S1 (grade sum 3) deals 3 damage and gives 3 guard', () => {
    const { report } = resolveTurn(newBattle(), horizontalSkill('S1 S1 S1'));
    expect(report.events.find((event) => event.type === 'enemy_damaged')).toMatchObject({ damage: 3 });
    expect(report.events.find((event) => event.type === 'player_guard_gained')).toMatchObject({ amount: 3 });
  });
});

describe('spec 1.2 / 1.4: win and loss events at every stage', () => {
  it('a regular win emits battle_won, healed, offers_drawn in that order', () => {
    const rng = createRng(3);
    const { events } = winBattle(startRun(M2_RUN), 30, rng);
    expect(eventTypes(events)).toEqual(['battle_won', 'healed', 'offers_drawn']);
    expect(events[0]).toEqual({ type: 'battle_won', stage: 0, hpAfter: 30 });
    expect(events[1]).toEqual({ type: 'healed', amount: HEAL_AMOUNT, hpAfter: 30 + HEAL_AMOUNT });
  });

  it('winning battle 5 (stage 4) heals to full whatever the HP, then offers rewards (k = 5)', () => {
    const result = winBattle(advanceToStage(REGULAR_BATTLES - 1), 1, createRng(3));
    expect(result.events[1]).toEqual({ type: 'healed', amount: MAX_HP - 1, hpAfter: MAX_HP });
    expect(result.run.state).toMatchObject({ phase: 'reward_add', playerHp: MAX_HP, stageIndex: REGULAR_BATTLES - 1 });
  });

  it('winning the boss emits battle_won and run_won only: no heal, no offers, no rng use', () => {
    const rng = scriptedRng([]);
    const result = winBattle(advanceToStage(BOSS_STAGE), 12, rng);
    expect(eventTypes(result.events)).toEqual(['battle_won', 'run_won']);
    expect(result.run.state).toMatchObject({ phase: 'victory', offers: null });
    expect(result.run.state.battle?.state.playerHp).toBe(12);
    expect(rng.calls()).toBe(0);
  });

  it.each(STAGES.map((enemy, stage) => [enemy.id, stage] as const))('losing to %s (stage %i) -> run_lost(stage), defeat', (_, stage) => {
    const result = loseBattle(advanceToStage(stage), scriptedRng([]));
    expect(result.events).toEqual([{ type: 'run_lost', stage }]);
    expect(result.run.state).toMatchObject({ phase: 'defeat', stageIndex: stage, offers: null });
    expect(isRunOver(result.run)).toBe(true);
    expect(result.run.state.reels).toHaveLength(3);
  });
});

describe('spec 1.4: player guard does not carry between battles', () => {
  it('guard held at the end of a won battle is 0 in the next battle', () => {
    const rng = createRng(3);
    const won = winBattle(withBattleState(startRun(M2_RUN), { playerGuard: 9 }), 40, rng).run;
    const next = skipOffer(won).run.state.battle;
    expect(next?.state.playerGuard).toBe(0);
    expect(next?.state.playerHp).toBe(40 + HEAL_AMOUNT);
    expect(next?.state.enemyHp).toBe(STAGES[1]?.hp);
  });
});

describe('spec 1.1: offers are stored once and the state is immutable', () => {
  const atRewardAdd = () => winBattle(startRun(M2_RUN), MAX_HP, createRng(5)).run;

  it('a rejected chooseOffer leaves the stored offers untouched (no reroll)', () => {
    const run = atRewardAdd();
    const offers = run.state.offers;
    expect(() => chooseOffer(run, 0, 3)).toThrow();
    expect(() => chooseOffer(run, 3, 0)).toThrow();
    expect(run.state.offers).toBe(offers);
    expect(offers).toHaveLength(3);
  });

  it('chooseOffer returns a new run and leaves the previous one in reward_add with the same offers', () => {
    const run = atRewardAdd();
    const before = JSON.stringify(run.state.reels);
    const { run: next } = chooseOffer(run, 1, 0);
    expect(next).not.toBe(run);
    expect(run.state.phase).toBe('reward_add');
    expect(JSON.stringify(run.state.reels)).toBe(before);
    expect(next.state.offers).toBeNull();
  });

  it('the added symbol is the chosen offer, at the very end of the chosen reel', () => {
    const run = atRewardAdd();
    const { run: next } = chooseOffer(run, 2, 1);
    expect(next.state.reels[1]?.at(-1)).toEqual(run.state.offers?.[2]);
    expect(reelSizes(next)).toEqual([6, 7, 6]);
  });
});

describe('spec 1.4: edit opportunities offer exactly what the reels allow', () => {
  const atEdit = () => {
    const rng = createRng(11);
    let run = startRun(M2_RUN);
    while (run.state.phase !== 'reward_edit') {
      run = run.state.phase === 'battle' ? winBattle(run, MAX_HP, rng).run : skipOffer(run).run;
    }
    return run;
  };

  it('opens only after battle 3 and lists both choices on the starting reels', () => {
    const run = atEdit();
    expect(run.state.stageIndex).toBe(EDIT_AFTER_CLEARED - 1);
    expect(editOptions(run)).toEqual({ canDelete: true, canEnhance: true });
  });

  it('an edit never changes HP, and the next battle starts with the carried HP', () => {
    const run = atEdit();
    const hp = run.state.playerHp;
    expect(enhanceSymbol(run, 0, 0).run.state.battle?.state.playerHp).toBe(hp);
    expect(deleteSymbol(run, 0, 0).run.state.battle?.state.playerHp).toBe(hp);
    expect(passEdit(run).run.state.battle?.state.playerHp).toBe(hp);
  });

  it('delete and enhance reject bad indices', () => {
    const run = atEdit();
    expect(() => deleteSymbol(run, 3, 0)).toThrow();
    expect(() => deleteSymbol(run, 0, 6)).toThrow();
    expect(() => enhanceSymbol(run, 0, -1)).toThrow();
    expect(() => enhanceSymbol(run, 9, 0)).toThrow();
  });
});

describe('spec 1.1 / 11: invalid run and battle data fail fast', () => {
  it('createBattle rejects a reel count other than 3', () => {
    const battle = startRun(M2_RUN).state.battle;
    const config = { ...(battle as NonNullable<typeof battle>).config };
    expect(() => createBattle({ ...config, reels: config.reels.slice(0, 2) })).toThrow();
  });

  it('startRun rejects a definition with no stages and a non-positive edit cycle', () => {
    expect(() => startRun({ ...M2_RUN, stages: [] })).toThrow();
    expect(() => startRun({ ...M2_RUN, rules: { ...RUN_RULES, editEveryNBattles: 0 } })).toThrow();
  });

  it('createBattle rejects startingHp of 0 and above max HP', () => {
    const battle = startRun(M2_RUN).state.battle as NonNullable<Run['state']['battle']>;
    expect(() => createBattle({ ...battle.config, startingHp: 0 })).toThrow();
    expect(() => createBattle({ ...battle.config, startingHp: MAX_HP + 1 })).toThrow();
  });
});

describe('spec 2.2: reward pool statistics (+-1 percentage point, 100k draws each)', () => {
  const DRAWS = 100_000;
  const TOLERANCE_PERCENT = 1;
  // [k, P(attack>=1), P(guard>=1), P(skill>=1), P(best>=3), P(hero)] in percent, from the spec table.
  const TABLE = [
    [1, 90.2, 82.2, 82.2, 0.0, 0.0],
    [2, 87.7, 78.5, 78.4, 7.7, 0.0],
    [3, 85.1, 74.3, 74.5, 32.6, 0.0],
    [4, 83.8, 72.9, 72.8, 49.3, 6.8],
    [5, 83.1, 72.0, 71.6, 64.4, 16.1],
  ] as const;

  function percentages(cleared: number) {
    const rng = createRng(20260);
    const count = { attack: 0, guard: 0, skill: 0, best3: 0, hero: 0 };
    for (let draw = 0; draw < DRAWS; draw++) {
      const offers = drawOffers(RUN_RULES, cleared, rng);
      const has = (actionId: string) => offers.some((offer) => offer.actionId === actionId);
      count.attack += has(ACTION_ATTACK) ? 1 : 0;
      count.guard += has(ACTION_GUARD) ? 1 : 0;
      count.skill += has(ACTION_SHIELD_BASH) ? 1 : 0;
      count.best3 += offers.some((offer) => offer.grade >= 3) ? 1 : 0;
      count.hero += offers.some((offer) => offer.grade === 4) ? 1 : 0;
    }
    const pct = (value: number) => (value / DRAWS) * 100;
    return [pct(count.attack), pct(count.guard), pct(count.skill), pct(count.best3), pct(count.hero)];
  }

  it.each(TABLE)('k = %i matches the spec table', (cleared, ...expected) => {
    percentages(cleared).forEach((actual, index) => {
      expect(Math.abs(actual - (expected[index] as number))).toBeLessThanOrEqual(TOLERANCE_PERCENT);
    });
  });
});

describe('headless full-run smoke: the engine only, every phase legal, all invariants hold', () => {
  type Step = { run: Run; events: readonly RunEvent[] };

  /** Attack-focused player: takes the best attack offer onto the smallest reel, deletes guard else enhances. */
  function playRun(seed: number): { final: Run; phases: string[]; maxReel: number; editAfter: number[] } {
    const rng: Rng = createRng(seed);
    let run = startRun(M2_RUN);
    const phases: string[] = [];
    const editAfter: number[] = [];
    let maxReel = 0;
    let turns = 0;
    while (!isRunOver(run)) {
      if (phases.at(-1) !== run.state.phase) phases.push(run.state.phase);
      const { reels } = run.state;
      maxReel = Math.max(maxReel, ...reelSizes(run));
      expect(reels).toHaveLength(3);
      reels.forEach((reel) => expect(reel.length).toBeGreaterThanOrEqual(REEL_MIN));
      expect(run.state.playerHp).toBeGreaterThan(0);
      expect(run.state.playerHp).toBeLessThanOrEqual(MAX_HP);
      if (run.state.phase === 'battle') {
        if (++turns > SAFETY_TURN_LIMIT) throw new Error('battle did not end');
        run = playRunTurn(run, rng).run;
      } else if (run.state.phase === 'reward_add') {
        turns = 0;
        run = pickOffer(run);
      } else {
        editAfter.push(run.state.stageIndex + 1);
        run = edit(run);
      }
    }
    return { final: run, phases, maxReel, editAfter };
  }

  function pickOffer(run: Run): Run {
    const offers = run.state.offers as readonly ReelSymbol[];
    const best = offers.filter((offer) => offer.actionId === ACTION_ATTACK).sort((a, b) => b.grade - a.grade)[0];
    if (!best) return skipOffer(run).run;
    const smallest = reelSizes(run).indexOf(Math.min(...reelSizes(run)));
    return chooseOffer(run, offers.indexOf(best), smallest).run;
  }

  function edit(run: Run): Run {
    const step: Step | null = (() => {
      for (let reelIndex = 0; reelIndex < 3; reelIndex++) {
        const symbolIndex = run.state.reels[reelIndex]?.findIndex((symbol) => symbol.actionId === ACTION_GUARD) ?? -1;
        if (symbolIndex >= 0 && editOptions(run).canDelete) return deleteSymbol(run, reelIndex, symbolIndex);
      }
      return editOptions(run).canEnhance ? enhanceSymbol(run, 0, 0) : null;
    })();
    return step ? step.run : passEdit(run).run;
  }

  const SEEDS = Array.from({ length: 300 }, (_, index) => index + 1);
  const outcomes = SEEDS.map(playRun);

  it('every run ends in victory or defeat, in a legal phase order', () => {
    outcomes.forEach(({ final, phases }) => {
      expect(['victory', 'defeat']).toContain(final.state.phase);
      const allowed = new Set(['battle', 'reward_add', 'reward_edit']);
      phases.forEach((phase) => expect(allowed.has(phase)).toBe(true));
      expect(phases[0]).toBe('battle');
    });
  });

  it('both the win path and the loss path occur in 300 seeded runs', () => {
    const wins = outcomes.filter(({ final }) => final.state.phase === 'victory').length;
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(SEEDS.length);
  });

  it('reels never exceed 11 symbols in M2 and the edit opportunity appears only after battle 3', () => {
    outcomes.forEach(({ maxReel, editAfter }) => {
      expect(maxReel).toBeLessThanOrEqual(REEL_MAX_IN_M2);
      editAfter.forEach((cleared) => expect(cleared).toBe(EDIT_AFTER_CLEARED));
    });
  });

  it('a victory reached the boss stage and a defeat records the stage it died on', () => {
    outcomes.forEach(({ final }) => {
      if (final.state.phase === 'victory') expect(final.state.stageIndex).toBe(BOSS_STAGE);
      else expect(final.state.stageIndex).toBeLessThanOrEqual(BOSS_STAGE);
      expect(symbolCount(final)).toBeGreaterThanOrEqual(3 * REEL_MIN);
    });
  });

  it('the same seed gives the identical final state', () => {
    const again = playRun(SEEDS[0] as number);
    expect(JSON.stringify(again.final.state.reels)).toBe(JSON.stringify(outcomes[0]?.final.state.reels));
    expect(again.final.state.phase).toBe(outcomes[0]?.final.state.phase);
    expect(again.final.state.stageIndex).toBe(outcomes[0]?.final.state.stageIndex);
  });
});
