// Pure text for reels: symbols, composition and the exact probability previews of the reel-edit screens
// (M2 spec 8). Values come from the engine's reel analysis; only rounding and wording happen here.
import type { ActionDef, ActionId, ReelCompositionEntry, ReelEditPreview, ReelSymbol } from '../core';
import { actionIcon, actionName, gradeName, type ActionNames, type GradeNames } from './format';
import { ACTION_DISPLAY_ORDER, GRADE_AVERAGE_DECIMALS, PERCENT_DECIMALS } from './ui-config';

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
  /** Detail row under an action (2+ lines, average grade). */
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

function gradeAverageRow(before: number, after: number): StatRow {
  const delta = formatDelta(after - before, GRADE_AVERAGE_DECIMALS, '');
  return {
    label: '평균 등급',
    before: before.toFixed(GRADE_AVERAGE_DECIMALS),
    after: after.toFixed(GRADE_AVERAGE_DECIMALS),
    delta: delta.text,
    trend: delta.trend,
    secondary: true,
    impossible: false,
  };
}

/**
 * Rows for one edit preview: the empty-turn chance, then per action its fire chance, its 2+ line chance
 * when that is non-zero before or after, and its average grade when the edit changes it.
 * Actions follow the analysis key order (the requested actionIds order).
 */
export function statRows(preview: ReelEditPreview, names: ActionNames): StatRow[] {
  const { before, after } = preview;
  const rows: StatRow[] = [percentRow('빈 턴', before.empty, after.empty, false)];
  for (const [actionId, next] of Object.entries(after.actions)) {
    const previous = before.actions[actionId];
    if (!previous) continue;
    rows.push({ ...percentRow(actionName(names, actionId), previous.fire, next.fire, false), impossible: next.fire === 0 });
    if (previous.fire2plus > 0 || next.fire2plus > 0) {
      rows.push(percentRow('2라인 이상', previous.fire2plus, next.fire2plus, true));
    }
    if (previous.avgGradeValue !== next.avgGradeValue) {
      rows.push(gradeAverageRow(previous.avgGradeValue, next.avgGradeValue));
    }
  }
  return rows;
}
