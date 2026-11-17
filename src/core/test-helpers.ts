// Test-only helpers: spec-style board notation ("A1 A3 A1" per row) -> board[reel][row].
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from '../data';
import { GRID_SIZE } from './lines';
import type { ActionId, Board, ReelSymbol } from './types';

export const TEST_ACTION_POKE = 'poke';

const NOTATION: Readonly<Record<string, ActionId>> = {
  A: ACTION_ATTACK,
  G: ACTION_GUARD,
  S: ACTION_SHIELD_BASH,
  P: TEST_ACTION_POKE,
};

function parseSymbol(token: string): ReelSymbol {
  const actionId = NOTATION[token.charAt(0)];
  const grade = Number(token.slice(1));
  if (!actionId || !Number.isInteger(grade)) {
    throw new Error(`bad board token "${token}"`);
  }
  return { actionId, grade };
}

/** Rows are drawn top to bottom, each row listing reel 0, 1, 2 (same layout as the spec examples). */
export function boardFromRows(rows: readonly string[]): Board {
  const grid = rows.map((row) => row.trim().split(/\s+/).map(parseSymbol));
  if (grid.length !== GRID_SIZE || grid.some((row) => row.length !== GRID_SIZE)) {
    throw new Error(`board "${rows.join(' / ')}" is not ${GRID_SIZE}x${GRID_SIZE}`);
  }
  return Array.from({ length: GRID_SIZE }, (_, reel) => grid.map((row) => row[reel] as ReelSymbol));
}

/** Two-action board with no fired line. */
export const EMPTY_BOARD = boardFromRows(['A1 A1 G1', 'G1 G1 A1', 'A1 A1 G1']);
