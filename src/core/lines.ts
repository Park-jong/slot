// Board geometry: a fixed 3x3 grid and its 8 paylines (spec 2.1). Geometry, not tunable game data.

export const GRID_SIZE = 3;

const FIRST_CELL_NUMBER = 1;

export type LineId = 'H1' | 'H2' | 'H3' | 'V1' | 'V2' | 'V3' | 'D1' | 'D2';

export interface Cell {
  readonly reel: number;
  readonly row: number;
}

export interface LineDef {
  readonly id: LineId;
  readonly cells: readonly Cell[];
}

/** Cell numbers follow the keypad layout 1 2 3 / 4 5 6 / 7 8 9, rows from top to bottom. */
export function cellNumberToCell(cellNumber: number): Cell {
  const offset = cellNumber - FIRST_CELL_NUMBER;
  return { reel: offset % GRID_SIZE, row: Math.floor(offset / GRID_SIZE) };
}

const LINE_CELL_NUMBERS: ReadonlyArray<readonly [LineId, readonly number[]]> = [
  ['H1', [1, 2, 3]],
  ['H2', [4, 5, 6]],
  ['H3', [7, 8, 9]],
  ['V1', [1, 4, 7]],
  ['V2', [2, 5, 8]],
  ['V3', [3, 6, 9]],
  ['D1', [1, 5, 9]],
  ['D2', [7, 5, 3]],
];

/** Fixed evaluation order H1..D2. */
export const LINES: readonly LineDef[] = LINE_CELL_NUMBERS.map(([id, cellNumbers]) => ({
  id,
  cells: cellNumbers.map(cellNumberToCell),
}));
