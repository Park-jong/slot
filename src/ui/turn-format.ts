// Pure text for the multi-spin turn (M2.5 spec 7.1): per-spin lines, spin counter, pooled status with tier
// hints, the "stop now" preview, the continue estimate and the settlement log. Every number comes from the
// engine (SpinReport, StopPreview, TurnReport); only wording and rounding happen here.
import {
  currentIntentPreview,
  EFFECT_IGNORE_GUARD,
  type ActionId,
  type BattleConfig,
  type ContinueEstimate,
  type EffectId,
  type JudgeResult,
  type LineId,
  type StopPreview,
  type StopPreviewAction,
  type StopReason,
  type TurnReport,
  type TurnStats,
} from '../core';
import {
  actionIcon,
  actionName,
  displayHp,
  formatEvent,
  formatIntentPreview,
  formatMultiplier,
  formatOutcome,
  formatPowerSummary,
  formatSignedPercent,
  type ActionNames,
  type LogSection,
  type TurnLog,
} from './format';
import { formatPercent } from './reel-format';
import { ESTIMATE_AVERAGE_DECIMALS } from './ui-config';

/** Fixed fragments of the turn text (spec 7.1 wording). */
export const TURN_TEXT = {
  emptySpin: '빈 스핀',
  emptyTurn: '아무 줄도 없음 - 행동 없음',
  nothingIfStopped: '지금 멈추면 아무 일도 없음',
  noLinesYet: '아직 성립한 줄 없음',
  topTier: '최대 단계',
  nextTier: '다음 단계',
  lethal: '적 처치! (적은 행동하지 않음)',
} as const;

const STOP_REASON_TEXT: Readonly<Record<StopReason, string>> = {
  player_stop: '멈춤',
  max_reached: '최대 도달 - 자동 정산',
};

const EFFECT_LABELS: Readonly<Record<EffectId, string>> = {
  [EFFECT_IGNORE_GUARD]: '방어도 무시',
};

/** A fired line as both a judged board and the `spun` event report it. */
export interface SpinLine {
  readonly lineId: LineId;
  readonly actionId: ActionId;
  readonly gradeSum: number;
}

/** A spin of the turn: a SpinRecord or a SpinReport. */
export interface SpinView {
  readonly index: number;
  readonly judgement: Pick<JudgeResult, 'firedLines'>;
}

/** "H1 공격 3": line id, action and grade sum. */
export function formatSpinLine(line: SpinLine, names: ActionNames): string {
  return `${line.lineId} ${actionName(names, line.actionId)} ${line.gradeSum}`;
}

/** The lines one spin fired, or "빈 스핀" (a spin without lines; the turn may still act). */
export function formatSpinLines(lines: readonly SpinLine[], names: ActionNames): string[] {
  return lines.length > 0 ? lines.map((line) => formatSpinLine(line, names)) : [TURN_TEXT.emptySpin];
}

/** "스핀 2: H1 공격 3 / V1 방어 3". */
export function formatSpinCaption(spin: SpinView, names: ActionNames): string {
  return `스핀 ${spin.index}: ${formatSpinLines(spin.judgement.firedLines, names).join(' / ')}`;
}

/** "🛡️ 방어도 0 (멈추면 +8)": the guard now and, while spinning, what stopping would add (U12). */
export function formatGuard(guard: number, pendingGuard: number): string {
  const current = `🛡️ 방어도 ${guard}`;
  return pendingGuard > 0 ? `${current} (멈추면 +${pendingGuard})` : current;
}

/** "사용 1 / 최대 3 · 남은 2" (U4). */
export function formatSpinCounter(spinsUsed: number, maxSpins: number, remainingSpins: number): string {
  return `사용 ${spinsUsed} / 최대 ${maxSpins} · 남은 ${remainingSpins}`;
}

/** Turn start: how many spins there are and what stopping early is worth. */
export function formatTurnStartHint(stats: TurnStats): string {
  return `한 턴에 최대 ${stats.maxSpins}회 스핀 · 남기는 스핀 1회당 집중 +${stats.focusPctPerUnused}%`;
}

export function spinAgainLabel(remainingSpins: number): string {
  return `🎰 한 번 더 (남은 ${remainingSpins})`;
}

export function stopLabel(focusPct: number): string {
  return `✋ 멈춤 (${formatSignedPercent(focusPct)})`;
}

/** One action of the pooled status (U3). */
export interface PooledActionText {
  readonly actionId: ActionId;
  /** "⚔️ 공격". */
  readonly title: string;
  /** "2줄 · 등급 합 6 · x1.5". */
  readonly detail: string;
  /** "1줄 더 → x2 · 3줄 → 방어도 무시", or "최대 단계". */
  readonly hint: string;
  /** What this action does if the player stops now: "피해 13". */
  readonly value: string;
}

/** Pooled status per fired action, in resolution order (previewStop().actions). */
export function pooledActionTexts(preview: StopPreview, names: ActionNames): PooledActionText[] {
  return preview.actions.map((action) => ({
    actionId: action.actionId,
    title: `${actionIcon(action.actionId)} ${actionName(names, action.actionId)}`,
    detail: `${action.lineCount}줄 · 등급 합 ${action.gradeSumTotal} · ${formatMultiplier(action.multiplierNum)}`,
    hint: formatTierHint(action, names),
    value: formatPowerSummary(action),
  }));
}

/** Next tier ("1줄 더 → x1.5", "최대 단계" when nextTierAt is null) and unreached effects ("3줄 → 방어도 무시"). */
export function formatTierHint(action: StopPreviewAction, names: ActionNames): string {
  const effects = action.nextEffects.map((effect) => `${effect.minLines}줄 → ${effectLabel(effect.id)}`);
  return [nextTierText(action, names), ...effects].join(' · ');
}

function nextTierText(action: StopPreviewAction, names: ActionNames): string {
  if (action.nextTierAt === null) {
    return TURN_TEXT.topTier;
  }
  const definition = names.actions.find((candidate) => candidate.id === action.actionId);
  const nextTier = definition?.tiers.find((tier) => tier.lineCount === action.nextTierAt);
  const target = nextTier ? formatMultiplier(nextTier.multiplierNum) : TURN_TEXT.nextTier;
  return `${action.nextTierAt - action.lineCount}줄 더 → ${target}`;
}

function effectLabel(effectId: EffectId): string {
  return EFFECT_LABELS[effectId] ?? effectId;
}

/** U5: totals with Focus, then the lethal flag or the player's HP after the enemy acts. */
export function formatStopPreview(preview: StopPreview, maxHp: number): string[] {
  const headline = preview.empty
    ? TURN_TEXT.nothingIfStopped
    : `지금 멈추면 피해 ${preview.totalDamage} / 방어 ${preview.totalGuard} / 집중 ${formatSignedPercent(preview.focusPct)}`;
  return [headline, preview.lethal ? TURN_TEXT.lethal : enemyAftermath(preview, maxHp)];
}

function enemyAftermath(preview: StopPreview, maxHp: number): string {
  const hp = `적 행동 후 내 HP ${displayHp(preview.playerHpAfterEnemy)}/${maxHp}`;
  return preview.incoming > 0 ? `${hp} (적 공격 ${preview.incoming})` : hp;
}

/** U6: the average of spinning exactly once more and then stopping, labelled as an average. */
export function formatContinueEstimate(estimate: ContinueEstimate): string {
  const average = (value: number): string => value.toFixed(ESTIMATE_AVERAGE_DECIMALS);
  return (
    `한 번 더 돌리면(평균) 피해 ${average(estimate.averageDamage)} / 방어 ${average(estimate.averageGuard)} · ` +
    `처치 ${formatPercent(estimate.lethalChance)} (표본 ${estimate.samples})`
  );
}

/** U11: "사용 2 / 최대 3 · 남은 1 → 집중 +50% (멈춤)". */
export function formatSpinPhaseSummary(report: TurnReport): string {
  return (
    `${formatSpinCounter(report.spinsUsed, report.maxSpins, report.unusedSpins)} → 집중 ${formatSignedPercent(report.focusPct)} ` +
    `(${STOP_REASON_TEXT[report.stopReason]})`
  );
}

/**
 * Settlement log of a turn (U2, U10, U11): each spin's lines, spins used / unused and the Focus applied, the
 * final power per action (or the empty-turn notice) and the battle events in engine order.
 */
export function formatTurn(report: TurnReport, config: BattleConfig): TurnLog {
  const sections: LogSection[] = [
    { label: '스핀', items: report.spins.map((spin) => formatSpinCaption(spin, config)) },
    { label: '정산', items: [formatSpinPhaseSummary(report)] },
    {
      label: '계산',
      items: report.empty ? [TURN_TEXT.emptyTurn] : report.outcomes.map((outcome) => formatOutcome(outcome, config)),
    },
    { label: '진행', items: report.events.map((event) => formatEvent(event, config)) },
  ];
  // The preview of the turn's starting state shows the charged value the enemy actually used.
  const intent = currentIntentPreview({ config, state: report.before });
  return {
    title: `턴 ${report.turn} · 적 의도 ${formatIntentPreview(intent)}`,
    sections: sections.filter((section) => section.items.length > 0),
  };
}
