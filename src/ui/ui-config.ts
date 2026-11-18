// Presentation-only settings: placeholder icons, fixed UI labels, number display and animation timings.
// Game numbers stay in src/data.
import type { ActionId, EndPhase, IntentType } from '../core';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from '../data';
import type { Screen } from './run-controller';

export const ACTION_ICONS: Readonly<Record<ActionId, string>> = {
  [ACTION_ATTACK]: '⚔️',
  [ACTION_GUARD]: '🛡️',
  [ACTION_SHIELD_BASH]: '💥',
};

export const FALLBACK_ACTION_ICON = '❔';

/** Order of actions in probability tables; actions missing here follow in data order. */
export const ACTION_DISPLAY_ORDER: readonly ActionId[] = [ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH];

export const EMPTY_CELL_ICON = '❓';

export const INTENT_ICONS: Readonly<Record<IntentType, string>> = {
  attack: '🗡️',
  guard: '🛡️',
  charge: '💢',
};

export const RESULT_ICONS: Readonly<Record<EndPhase, string>> = {
  victory: '🏆',
  defeat: '💀',
};

export const BOSS_ICON = '👑';

/** Decimals for fire probabilities (percent) and their point deltas. */
export const PERCENT_DECIMALS = 1;

/** Decimals for average grade values. */
export const GRADE_AVERAGE_DECIMALS = 2;

/** Decimals for expected pooled lines per turn on the reel-edit screens. */
export const EXPECTED_LINES_DECIMALS = 2;

/** Decimals for the averages of the "one more spin" estimate. */
export const ESTIMATE_AVERAGE_DECIMALS = 1;

/**
 * "One more spin" estimate (M2.5 spec 2.6 / U6, P2): samples per estimate and the seed of its own rng.
 * A fixed seed makes the shown average reproducible for a given turn state; the run rng is never used.
 */
export const CONTINUE_ESTIMATE = { samples: 200, seed: 1 } as const;

/** Fixed view labels. Text built from engine values lives in the format modules. */
export const LABELS = {
  appTitle: '슬롯 RPG - M2.5 런',
  spin: '🎰 스핀',
  turnPanel: '이번 턴',
  pooledTitle: '합산 현황 (지금 멈추면)',
  earlierSpins: '이전 스핀',
  boardIdle: '스핀을 눌러 턴을 시작하세요',
  intent: '다음 행동',
  battleLog: '전투 기록',
  myReels: '내 릴 구성',
  rewardTitle: '보상: 심볼 하나를 골라 릴 끝에 추가',
  rewardHint: '건너뛰면 아무것도 받지 않습니다. 각 칸은 추가했을 때의 한 턴 발동 확률 변화입니다.',
  skipReward: '건너뛰기 (받지 않음)',
  editTitle: '릴 편집 기회: 심볼 하나를 삭제하거나 강화',
  editHint: '하나만 고를 수 있습니다. 강화는 발동 확률을 바꾸지 않고 위력(평균 등급)만 올립니다.',
  deleteSection: '삭제',
  enhanceSection: '강화',
  deleteUnavailable: '모든 릴이 최소 크기라 삭제할 수 없습니다',
  enhanceUnavailable: '강화할 수 있는 심볼이 없습니다 (모두 최고 등급)',
  passEdit: '통과 (편집하지 않음)',
  reelFull: '릴이 가득 참',
  reelAtMinimum: '최소 크기',
  topGrade: '최고 등급',
  impossible: '발동 불가',
  statHeader: ['', '현재', '변경 후', '차이'],
  restart: '새 런 시작',
  finalReels: '최종 릴 구성',
} as const;

/** Button shown on the battle screen once a battle ends, by the screen it leads to. */
export const CONTINUE_LABELS: Readonly<Record<Screen, string>> = {
  battle: '다음 전투 →',
  reward: '보상 고르기 →',
  edit: '릴 편집 →',
  end: '결과 보기 →',
};

/** Reels stop left to right; the first stop waits a little so the spin is visible at all. */
export const REEL_ANIMATION = {
  firstStopMs: 450,
  stopIntervalMs: 300,
} as const;

/** Used instead of REEL_ANIMATION when the user prefers reduced motion. */
export const INSTANT_REELS = { firstStopMs: 0, stopIntervalMs: 0 } as const;

/** The seed predicts every spin, so it is shown only with this URL query flag (e.g. ?debug). */
export const DEBUG_QUERY_PARAM = 'debug';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
