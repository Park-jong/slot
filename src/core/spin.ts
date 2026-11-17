import { GRID_SIZE } from './lines';
import type { Rng } from './rng';
import type { Board, Reel, ReelSymbol } from './types';

/**
 * Draws 3 symbols per reel without replacement (spec 2.2). Calls rng exactly 9 times,
 * reel 0 first; drawn order is row 0, 1, 2. Input reels are never mutated.
 */
export function spin(reels: readonly Reel[], rng: Rng): Board {
  if (reels.length !== GRID_SIZE) {
    throw new Error(`spin: expected ${GRID_SIZE} reels, got ${reels.length}`);
  }
  return reels.map((reel, reelIndex) => drawColumn(reel, reelIndex, rng));
}

function drawColumn(reel: Reel, reelIndex: number, rng: Rng): ReelSymbol[] {
  if (reel.length < GRID_SIZE) {
    throw new Error(`spin: reel ${reelIndex} has ${reel.length} symbols, needs at least ${GRID_SIZE}`);
  }
  const remaining = [...reel];
  const column: ReelSymbol[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const index = Math.floor(drawUnit(rng) * remaining.length);
    column.push(...remaining.splice(index, 1));
  }
  return column;
}

/** Rejects out-of-contract rng values; NaN fails both comparisons, so it is rejected too. */
function drawUnit(rng: Rng): number {
  const value = rng();
  if (!(value >= 0 && value < 1)) {
    throw new Error(`spin: rng returned ${value}, expected a value in [0, 1)`);
  }
  return value;
}
