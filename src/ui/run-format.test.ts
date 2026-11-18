import { describe, expect, it } from 'vitest';
import { createRng, passEdit, skipOffer, startRun, type Run, type RunEvent } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH, M25_RUN, M2_RUN } from '../data';
import { loseBattle, winBattle } from '../test-support/run-helpers';
import { scriptedRng } from '../test-support/test-helpers';
import {
  enemyLabel,
  formatRunEnd,
  formatRunEvents,
  formatRunProgress,
  formatRunStepLog,
  stageLabel,
  stageTrack,
} from './run-format';

const BOSS_STAGE = M2_RUN.stages.length - 1;

/** Wins every battle at full HP, skipping adds and passing the edit, until the run is at the given stage. */
function runAtStage(stageIndex: number): Run {
  const rng = createRng(1);
  let run = startRun(M2_RUN);
  while (run.state.phase !== 'battle' || run.state.stageIndex !== stageIndex) {
    if (run.state.phase === 'battle') run = winBattle(run, run.state.maxHp, rng).run;
    else if (run.state.phase === 'reward_add') run = skipOffer(run).run;
    else run = passEdit(run).run;
  }
  return run;
}

describe('stage labels', () => {
  it('numbers stages from 1 of 6 and marks the boss', () => {
    expect(stageLabel(M2_RUN, 0)).toBe('전투 1/6');
    expect(enemyLabel(M2_RUN, 1)).toBe('어린 고블린');
    expect(enemyLabel(M2_RUN, BOSS_STAGE)).toBe('👑 보스 오우거');
  });
});

describe('formatRunProgress and stageTrack', () => {
  it('battle 1: current stage, everything else upcoming', () => {
    const run = startRun(M2_RUN);
    expect(formatRunProgress(run)).toBe('전투 1/6 · 슬라임');
    expect(stageTrack(run).map((chip) => chip.status)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(stageTrack(run).map((chip) => chip.boss)).toEqual([false, false, false, false, false, true]);
  });

  it('reward after battle 1 names the next enemy', () => {
    const run = winBattle(startRun(M2_RUN), 36, createRng(1)).run;
    expect(formatRunProgress(run)).toBe('전투 1/6 클리어 · 보상 선택 · 다음: 어린 고블린');
    expect(stageTrack(run)[0]?.status).toBe('cleared');
    expect(stageTrack(run)[1]?.status).toBe('upcoming');
  });

  it('the edit opportunity after battle 3', () => {
    const run = skipOffer(winBattle(runAtStage(2), 50, createRng(1)).run).run;
    expect(run.state.phase).toBe('reward_edit');
    expect(formatRunProgress(run)).toBe('전투 3/6 클리어 · 릴 편집 · 다음: 고블린');
  });

  it('the boss battle and the reward before it', () => {
    const boss = runAtStage(BOSS_STAGE);
    expect(formatRunProgress(boss)).toBe('전투 6/6 · 👑 보스 오우거');
    expect(stageTrack(boss).at(-1)?.status).toBe('current');
    const beforeBoss = winBattle(runAtStage(BOSS_STAGE - 1), 20, createRng(1)).run;
    expect(formatRunProgress(beforeBoss)).toBe('전투 5/6 클리어 · 보상 선택 · 다음: 👑 보스 오우거');
  });

  it('defeat marks the stage that was lost', () => {
    const run = loseBattle(runAtStage(1), createRng(1)).run;
    expect(formatRunProgress(run)).toBe('전투 2/6에서 패배 · 어린 고블린');
    expect(stageTrack(run).slice(0, 3).map((chip) => chip.status)).toEqual(['cleared', 'lost', 'upcoming']);
  });
});

describe('run events', () => {
  it('a won battle: result, heal and the offers drawn (spec example 1a offers)', () => {
    const { events } = winBattle(startRun(M2_RUN), 36, scriptedRng([0, 0.5, 0.999]));
    expect(formatRunEvents(events, M2_RUN)).toEqual([
      '전투 1/6 승리: 슬라임 처치 (남은 HP 36)',
      '회복 +8 → HP 44/50',
      '보상 후보 3개: ⚔️ 공격 일반, 🛡️ 방어 고급, 💥 방패 강타 고급',
    ]);
  });

  it('formats every reward, edit and end event', () => {
    const events: RunEvent[] = [
      { type: 'symbol_added', reelIndex: 2, symbol: { actionId: ACTION_ATTACK, grade: 2 } },
      { type: 'add_skipped' },
      { type: 'symbol_deleted', reelIndex: 1, symbolIndex: 3, symbol: { actionId: ACTION_GUARD, grade: 1 } },
      {
        type: 'symbol_enhanced',
        reelIndex: 2,
        symbolIndex: 4,
        from: { actionId: ACTION_SHIELD_BASH, grade: 1 },
        to: { actionId: ACTION_SHIELD_BASH, grade: 2 },
      },
      { type: 'edit_passed' },
      { type: 'healed', amount: 0, hpAfter: 50 },
      { type: 'run_won' },
      { type: 'run_lost', stage: 1 },
    ];
    expect(formatRunEvents(events, M2_RUN)).toEqual([
      '릴 3에 ⚔️ 공격 고급 추가',
      '보상을 받지 않고 건너뜀',
      '릴 2에서 🛡️ 방어 일반 삭제',
      '릴 3의 💥 방패 강타 일반 → 💥 방패 강타 고급 강화',
      '편집 기회 통과',
      '회복 +0 → HP 50/50',
      '런 클리어!',
      '전투 2/6에서 쓰러짐 - 런 종료',
    ]);
  });

  it('logs run events of a turn, nothing for a turn without them', () => {
    expect(formatRunStepLog([], M2_RUN)).toBeNull();
    expect(formatRunStepLog([{ type: 'run_won' }], M2_RUN)).toEqual({
      title: '런 진행',
      sections: [{ label: '결과', items: ['런 클리어!'] }],
    });
  });
});

describe('formatRunEnd', () => {
  it('is null while the run goes on', () => {
    expect(formatRunEnd(startRun(M2_RUN))).toBeNull();
  });

  it('defeat: stage reached, battles cleared and HP', () => {
    const run = loseBattle(runAtStage(1), createRng(1)).run;
    expect(formatRunEnd(run)).toEqual({
      phase: 'defeat',
      title: '런 실패',
      summary: '도달: 전투 2/6 (어린 고블린) · 클리어 1/6 · 남은 HP 0/50',
    });
  });

  it('victory after the boss', () => {
    const run = winBattle(runAtStage(BOSS_STAGE), 27, createRng(1)).run;
    expect(formatRunEnd(run)).toEqual({
      phase: 'victory',
      title: '런 클리어!',
      summary: '도달: 전투 6/6 (👑 보스 오우거) · 클리어 6/6 · 남은 HP 27/50',
    });
  });
});

describe('the M2.5 product run', () => {
  it('shows the same progress text and boss marker for the M2.5 stages', () => {
    const run = startRun(M25_RUN);
    expect(formatRunProgress(run)).toBe('전투 1/6 · 슬라임');
    expect(enemyLabel(M25_RUN, M25_RUN.stages.length - 1)).toBe('👑 보스 오우거');
    const won = winBattle(run, 40, createRng(1));
    expect(formatRunEvents(won.events, M25_RUN).slice(0, 2)).toEqual(['전투 1/6 승리: 슬라임 처치 (남은 HP 40)', '회복 +8 → HP 48/50']);
  });
});
