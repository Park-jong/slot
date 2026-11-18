// Pure text for the run layer (M2 spec 1): progress, stage track, run events and the run end summary.
import {
  battlesCleared,
  bossStageIndex,
  type EndPhase,
  type Run,
  type RunDefinition,
  type RunEvent,
  type RunPhase,
} from '../core';
import { displayHp, type TurnLog } from './format';
import { formatSymbol, reelLabel } from './reel-format';
import { BOSS_ICON } from './ui-config';

/** Stages are 0-based in the engine and numbered from 1 on screen. */
const FIRST_DISPLAY_NUMBER = 1;

function isBossStage(definition: RunDefinition, stageIndex: number): boolean {
  return stageIndex === bossStageIndex(definition);
}

/** "전투 3/6". */
export function stageLabel(definition: RunDefinition, stageIndex: number): string {
  return `전투 ${stageIndex + FIRST_DISPLAY_NUMBER}/${definition.stages.length}`;
}

/** Enemy name of a stage, boss marked: "👑 보스 오우거". */
export function enemyLabel(definition: RunDefinition, stageIndex: number): string {
  const name = definition.stages[stageIndex]?.name ?? '';
  return isBossStage(definition, stageIndex) ? `${BOSS_ICON} 보스 ${name}` : name;
}

const PROGRESS_FORMATTERS: Readonly<Record<RunPhase, (run: Run) => string>> = {
  battle: ({ definition, state }) => `${stageLabel(definition, state.stageIndex)} · ${enemyLabel(definition, state.stageIndex)}`,
  reward_add: (run) => `${clearedText(run)} · 보상 선택 · 다음: ${nextEnemy(run)}`,
  reward_edit: (run) => `${clearedText(run)} · 릴 편집 · 다음: ${nextEnemy(run)}`,
  victory: (run) => `런 클리어! (${battlesCleared(run)}/${run.definition.stages.length})`,
  defeat: ({ definition, state }) =>
    `${stageLabel(definition, state.stageIndex)}에서 패배 · ${enemyLabel(definition, state.stageIndex)}`,
};

function clearedText({ definition, state }: Run): string {
  return `${stageLabel(definition, state.stageIndex)} 클리어`;
}

/** During the reward phases stageIndex is the stage just cleared; the next battle is the following one. */
function nextEnemy({ definition, state }: Run): string {
  return enemyLabel(definition, state.stageIndex + 1);
}

export function formatRunProgress(run: Run): string {
  return PROGRESS_FORMATTERS[run.state.phase](run);
}

export type StageStatus = 'cleared' | 'current' | 'upcoming' | 'lost';

export interface StageChip {
  readonly label: string;
  readonly boss: boolean;
  readonly status: StageStatus;
}

/** One chip per stage for the progress track. */
export function stageTrack(run: Run): StageChip[] {
  const { definition, state } = run;
  const cleared = battlesCleared(run);
  const statusOf = (index: number): StageStatus => {
    if (index < cleared) return 'cleared';
    if (index !== state.stageIndex) return 'upcoming';
    if (state.phase === 'defeat') return 'lost';
    return state.phase === 'battle' ? 'current' : 'upcoming';
  };
  return definition.stages.map((_, index) => ({
    label: enemyLabel(definition, index),
    boss: isBossStage(definition, index),
    status: statusOf(index),
  }));
}

type RunEventType = RunEvent['type'];
type RunEventOf<T extends RunEventType> = Extract<RunEvent, { readonly type: T }>;
type RunEventFormatter<T extends RunEventType> = (event: RunEventOf<T>, definition: RunDefinition) => string;

// One entry per run event type; the mapped type makes a missing entry a compile error.
const RUN_EVENT_FORMATTERS: { readonly [T in RunEventType]: RunEventFormatter<T> } = {
  battle_won: (event, definition) =>
    `${stageLabel(definition, event.stage)} 승리: ${definition.stages[event.stage]?.name ?? ''} 처치 ` +
    `(남은 HP ${displayHp(event.hpAfter)})`,
  healed: (event, definition) => `회복 +${event.amount} → HP ${event.hpAfter}/${definition.character.maxHp}`,
  offers_drawn: (event, definition) =>
    `보상 후보 ${event.offers.length}개: ${event.offers.map((offer) => formatSymbol(offer, definition)).join(', ')}`,
  symbol_added: (event, definition) => `${reelLabel(event.reelIndex)}에 ${formatSymbol(event.symbol, definition)} 추가`,
  add_skipped: () => '보상을 받지 않고 건너뜀',
  symbol_deleted: (event, definition) =>
    `${reelLabel(event.reelIndex)}에서 ${formatSymbol(event.symbol, definition)} 삭제`,
  symbol_enhanced: (event, definition) =>
    `${reelLabel(event.reelIndex)}의 ${formatSymbol(event.from, definition)} → ${formatSymbol(event.to, definition)} 강화`,
  edit_passed: () => '편집 기회 통과',
  run_won: () => '런 클리어!',
  run_lost: (event, definition) => `${stageLabel(definition, event.stage)}에서 쓰러짐 - 런 종료`,
};

function formatRunEvent(event: RunEvent, definition: RunDefinition): string {
  // TypeScript cannot correlate event.type with the matching formatter's parameter type, hence the cast.
  const formatter = RUN_EVENT_FORMATTERS[event.type] as RunEventFormatter<RunEventType>;
  return formatter(event, definition);
}

export function formatRunEvents(events: readonly RunEvent[], definition: RunDefinition): string[] {
  return events.map((event) => formatRunEvent(event, definition));
}

/** Log entry for the run events of a battle turn; null when the turn changed nothing at run level. */
export function formatRunStepLog(events: readonly RunEvent[], definition: RunDefinition): TurnLog | null {
  if (events.length === 0) {
    return null;
  }
  return { title: '런 진행', sections: [{ label: '결과', items: formatRunEvents(events, definition) }] };
}

export interface RunEndText {
  readonly phase: EndPhase;
  readonly title: string;
  readonly summary: string;
}

const RUN_END_TITLES: Readonly<Record<EndPhase, string>> = { victory: '런 클리어!', defeat: '런 실패' };

/** Null while the run is still going. */
export function formatRunEnd(run: Run): RunEndText | null {
  const { definition, state } = run;
  if (state.phase !== 'victory' && state.phase !== 'defeat') {
    return null;
  }
  return {
    phase: state.phase,
    title: RUN_END_TITLES[state.phase],
    summary:
      `도달: ${stageLabel(definition, state.stageIndex)} (${enemyLabel(definition, state.stageIndex)}) · ` +
      `클리어 ${battlesCleared(run)}/${definition.stages.length} · ` +
      `남은 HP ${displayHp(state.playerHp)}/${state.maxHp}`,
  };
}
