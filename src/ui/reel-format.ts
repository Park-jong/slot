// Pure text for reels: symbols, composition and the exact probability previews of the reel-edit screens
// (M2 spec 8, M2.5 spec 7.2: per turn, pooled over the effective max spins). Values come from the engine's
// reel analysis; only rounding and wording happen here.
import type { ActionAnalysis, ActionDef, ActionId, ReelCompositionEntry, ReelEditPreview, ReelSymbol } from '../core';
import { actionIcon, actionName, gradeName, type ActionNames, type GradeNames } from './format';
import { ACTION_DISPLAY_ORDER, EXPECTED_LINES_DECIMALS, GRADE_AVERAGE_DECIMALS, PERCENT_DECIMALS } from './ui-config';

const PERCENT_SCALE = 100;
/** Reels are 0-based in the engine and numbered from 1 on screen. */
const FIRST_DISPLAY_NUMBER = 1;

export type SymbolNames = ActionNames & GradeNames;

export type Trend = 'up' | 'down' | 'same';

export interface StatRow {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly delta: string;
  readonly trend: Trend;
  /** Detail row under an action (2+ / 3+ lines, expected lines, average grade). */
  readonly secondary: boolean;
  /** The action cannot fire at all after the edit: the exact probability is 0. A tiny nonzero value that merely displays as 0.0% is not flagged. */
  readonly impossible: boolean;
}

/** Action ids in table order: ACTION_DISPLAY_ORDER first, then any other data actions in data order. */
export function displayActionIds(actions: readonly ActionDef[]): ActionId[] {
  const rank = (id: ActionId): number => {
    const index = ACTION_DISPLAY_ORDER.indexOf(id);
    return index === -1 ? ACTION_DISPLAY_ORDER.length : index;
  };
  return actions.map((action) => action.id).sort((a, b) => rank(a) - rank(b));
}

export function reelLabel(reelIndex: number): string {
  return `릴 ${reelIndex + FIRST_DISPLAY_NUMBER}`;
}

export function formatReelTitle(reelIndex: number, size: number): string {
  return `${reelLabel(reelIndex)} · ${size}개`;
}

export function formatSymbol(symbol: ReelSymbol, names: SymbolNames): string {
  return `${actionIcon(symbol.actionId)} ${actionName(names, symbol.actionId)} ${gradeName(names, symbol.grade)}`;
}

export function formatCompositionEntry(entry: ReelCompositionEntry, names: SymbolNames): string {
  return `${formatSymbol(entry, names)} ×${entry.count}`;
}

/** Which turn the probabilities describe (M2.5 spec 7.2): every spin of the turn taken, lines pooled. */
export function formatTurnBasis(spins: number): string {
  return `발동 확률은 한 턴 기준입니다 (스핀 ${spins}회를 모두 돌려 합산).`;
}

export function formatPercent(probability: number): string {
  return `${(probability * PERCENT_SCALE).toFixed(PERCENT_DECIMALS)}%`;
}

interface Delta {
  readonly text: string;
  readonly trend: Trend;
}

/** Signed difference rounded for display; a difference that rounds to zero reads as no change. */
function formatDelta(difference: number, decimals: number, unit: string): Delta {
  const rounded = Number(difference.toFixed(decimals));
  if (rounded === 0) {
    return { text: '±0', trend: 'same' };
  }
  const sign = rounded > 0 ? '+' : '-';
  return { text: `${sign}${Math.abs(rounded).toFixed(decimals)}${unit}`, trend: rounded > 0 ? 'up' : 'down' };
}

/** Percent as shown on screen (rounded), so before, after and change always add up on the page. */
function displayedPercent(probability: number): number {
  return Number((probability * PERCENT_SCALE).toFixed(PERCENT_DECIMALS));
}

function percentDelta(before: number, after: number): Delta {
  return formatDelta(displayedPercent(after) - displayedPercent(before), PERCENT_DECIMALS, '%p');
}

function percentRow(label: string, before: number, after: number, secondary: boolean): StatRow {
  const delta = percentDelta(before, after);
  return {
    label,
    before: formatPercent(before),
    after: formatPercent(after),
    delta: delta.text,
    trend: delta.trend,
    secondary,
    impossible: false,
  };
}

/** A secondary row of plain numbers (expected lines, average grade) with the given decimals. */
function numberRow(label: string, before: number, after: number, decimals: number): StatRow {
  const delta = formatDelta(after - before, decimals, '');
  return {
    label,
    before: before.toFixed(decimals),
    after: after.toFixed(decimals),
    delta: delta.text,
    trend: delta.trend,
    secondary: true,
    impossible: false,
  };
}

/** Pooled line-count thresholds shown under an action: 2 (second tier) and 3 (last tier, ignore_guard). */
const LINE_THRESHOLD_ROWS: readonly { readonly label: string; readonly pick: (stats: ActionAnalysis) => number }[] = [
  { label: '2줄 이상', pick: (stats) => stats.fire2plus },
  { label: '3줄 이상', pick: (stats) => stats.fire3plus },
];

/**
 * Rows for one edit preview: the empty-turn chance, then per action its chance of at least one line, its 2+ and
 * 3+ line chances when non-zero before or after, its expected lines when it can fire, and its average grade
 * when the edit changes it. Actions follow the analysis key order (the requested actionIds order).
 */
export function statRows(preview: ReelEditPreview, names: ActionNames): StatRow[] {
  const { before, after } = preview;
  const rows: StatRow[] = [percentRow('빈 턴', before.empty, after.empty, false)];
  for (const [actionId, next] of Object.entries(after.actions)) {
    const previous = before.actions[actionId];
    if (!previous) continue;
    rows.push({ ...percentRow(actionName(names, actionId), previous.fire, next.fire, false), impossible: next.fire === 0 });
    for (const { label, pick } of LINE_THRESHOLD_ROWS) {
      if (pick(previous) > 0 || pick(next) > 0) {
        rows.push(percentRow(label, pick(previous), pick(next), true));
      }
    }
    if (previous.fire > 0 || next.fire > 0) {
      rows.push(numberRow('기대 줄 수', previous.expectedLines, next.expectedLines, EXPECTED_LINES_DECIMALS));
    }
    if (previous.avgGradeValue !== next.avgGradeValue) {
      rows.push(numberRow('평균 등급', previous.avgGradeValue, next.avgGradeValue, GRADE_AVERAGE_DECIMALS));
    }
  }
  return rows;
}
