import { GRID_SIZE } from './lines';
import { drawUnit, type Rng } from './rng';
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

