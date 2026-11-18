// Pure reel editing (M2 spec 1.4): append, delete and enhance one symbol. Inputs are never mutated;
// every operation validates its indices and limits and throws on an invalid edit.
import type { GradeId, GradeTable, Reel, ReelSymbol, RunRules } from './types';

export function canAppendTo(reels: readonly Reel[], reelIndex: number, rules: RunRules): boolean {
  const reel = reels[reelIndex];
  return reel !== undefined && reel.length < rules.reelMax;
}

export function canDeleteFrom(reels: readonly Reel[], reelIndex: number, rules: RunRules): boolean {
  const reel = reels[reelIndex];
  return reel !== undefined && reel.length > rules.reelMin;
}

export function canEnhanceAt(reels: readonly Reel[], reelIndex: number, symbolIndex: number, grades: GradeTable): boolean {
  const symbol = reels[reelIndex]?.[symbolIndex];
  return symbol !== undefined && nextGrade(grades, symbol.grade) !== undefined;
}

export function anyDeletable(reels: readonly Reel[], rules: RunRules): boolean {
  return reels.some((_, reelIndex) => canDeleteFrom(reels, reelIndex, rules));
}

export function anyEnhanceable(reels: readonly Reel[], grades: GradeTable): boolean {
  return reels.some((reel, reelIndex) => reel.some((_, symbolIndex) => canEnhanceAt(reels, reelIndex, symbolIndex, grades)));
}

export function allReelsFull(reels: readonly Reel[], rules: RunRules): boolean {
  return reels.every((_, reelIndex) => !canAppendTo(reels, reelIndex, rules));
}

/** Adds the symbol at the end of the reel. */
export function appendSymbol(reels: readonly Reel[], reelIndex: number, symbol: ReelSymbol, rules: RunRules): Reel[] {
  const reel = reelAt(reels, reelIndex);
  if (!canAppendTo(reels, reelIndex, rules)) {
    throw new Error(`appendSymbol: reel ${reelIndex} is already at the maximum of ${rules.reelMax}`);
  }
  return replaceReel(reels, reelIndex, [...reel, symbol]);
}

export function deleteSymbolAt(reels: readonly Reel[], reelIndex: number, symbolIndex: number, rules: RunRules): Reel[] {
  const reel = reelAt(reels, reelIndex);
  symbolAt(reel, reelIndex, symbolIndex);
  if (!canDeleteFrom(reels, reelIndex, rules)) {
    throw new Error(`deleteSymbolAt: reel ${reelIndex} is already at the minimum of ${rules.reelMin}`);
  }
  return replaceReel(reels, reelIndex, reel.filter((_, index) => index !== symbolIndex));
}

/** Raises only the chosen symbol to the next grade, in place (size and order unchanged). */
export function enhanceSymbolAt(reels: readonly Reel[], reelIndex: number, symbolIndex: number, grades: GradeTable): Reel[] {
  const reel = reelAt(reels, reelIndex);
  const symbol = symbolAt(reel, reelIndex, symbolIndex);
  const grade = nextGrade(grades, symbol.grade);
  if (grade === undefined) {
    throw new Error(`enhanceSymbolAt: grade ${symbol.grade} at reel ${reelIndex}[${symbolIndex}] is already the highest`);
  }
  return replaceReel(reels, reelIndex, reel.map((current, index) => (index === symbolIndex ? { ...current, grade } : current)));
}

/** Lowest grade id above the given one, or undefined at the top grade. */
export function nextGrade(grades: GradeTable, grade: GradeId): GradeId | undefined {
  const higher = Object.values(grades)
    .map((definition) => definition.id)
    .filter((id) => id > grade);
  return higher.length > 0 ? Math.min(...higher) : undefined;
}

function reelAt(reels: readonly Reel[], reelIndex: number): Reel {
  const reel = reels[reelIndex];
  if (!reel) {
    throw new Error(`reel index ${reelIndex} is out of range 0..${reels.length - 1}`);
  }
  return reel;
}

function symbolAt(reel: Reel, reelIndex: number, symbolIndex: number): ReelSymbol {
  const symbol = reel[symbolIndex];
  if (!symbol) {
    throw new Error(`symbol index ${symbolIndex} is out of range for reel ${reelIndex} (size ${reel.length})`);
  }
  return symbol;
}

function replaceReel(reels: readonly Reel[], reelIndex: number, reel: Reel): Reel[] {
  return reels.map((current, index) => (index === reelIndex ? reel : current));
}
