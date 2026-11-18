// Test-only helpers: spec-style notation ("A1 A3 A1") for boards and reels, and a scripted rng.
import { GRID_SIZE } from '../core/lines';
import type { Rng } from '../core/rng';
import type { ActionId, Board, Reel, ReelSymbol } from '../core/types';
import { ACTION_ATTACK, ACTION_GUARD, ACTION_SHIELD_BASH } from '../data';

export const TEST_ACTION_POKE = 'poke';

const NOTATION: Readonly<Record<string, ActionId>> = {
  A: ACTION_ATTACK,
  G: ACTION_GUARD,
  S: ACTION_SHIELD_BASH,
  P: TEST_ACTION_POKE,
};

export function parseSymbol(token: string): ReelSymbol {
  const actionId = NOTATION[token.charAt(0)];
  const grade = Number(token.slice(1));
  if (!actionId || !Number.isInteger(grade)) {
    throw new Error(`bad symbol token "${token}"`);
  }
  return { actionId, grade };
}

/** "A1 A1 G1" -> one reel, symbols in the written order. */
export function reelFromNotation(notation: string): Reel {
  return notation.trim().split(/\s+/).map(parseSymbol);
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

/** Only H1 fires: one attack line, grade sum 3 -> 6 damage. */
export const SINGLE_ATTACK_BOARD = boardFromRows(['A1 A1 A1', 'G1 G1 A1', 'A1 A1 G1']);

/** Only H1 fires: one guard line, grade sum 3 -> 6 guard. */
export const SINGLE_GUARD_BOARD = boardFromRows(['G1 G1 G1', 'A1 S1 A1', 'S1 A1 S1']);

export type ScriptedRng = Rng & { readonly calls: () => number };

/** Returns the given values in order and throws once they run out, so extra rng calls fail loudly. */
export function scriptedRng(values: readonly number[]): ScriptedRng {
  let index = 0;
  const rng = () => {
    const value = values[index++];
    if (value === undefined) throw new Error('scripted rng exhausted');
    return value;
  };
  return Object.assign(rng, { calls: () => index });
}
