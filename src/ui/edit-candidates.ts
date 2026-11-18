// Choices of the reward and edit screens with their exact previews (M2 spec 8 preview scope, M2.5 spec 7.2:
// per turn over the effective max spins). Availability comes only from the engine queries; numbers come only
// from the engine's reel analysis.
import {
  analyzeEdit,
  analyzeReels,
  canAddToReel,
  canDeleteFromReel,
  canEnhanceSymbol,
  reelComposition,
  resolveTurnStats,
  type AnalyzeOptions,
  type ReelAnalysis,
  type ReelEdit,
  type ReelEditPreview,
  type ReelSymbol,
  type Run,
} from '../core';
import { displayActionIds } from './reel-format';

/** Effective max spins of the run's next turns: character base spins with the run's turn modifiers. */
export function turnSpins(run: Run): number {
  const { definition, state } = run;
  return resolveTurnStats(definition.character.spinsPerTurn, definition.rules, state.modifiers).maxSpins;
}

/**
 * Turn-level analysis (spins = effective max spins). Every action is always listed, so an action that
 * disappears shows as 0% instead of vanishing.
 */
export function analysisOptions(run: Run): AnalyzeOptions {
  const { definition } = run;
  return {
    grades: definition.grades,
    actionIds: displayActionIds(definition.actions),
    spins: turnSpins(run),
    spinsPerTurnHardCap: definition.rules.spinsPerTurnHardCap,
  };
}

export interface AddCandidate {
  readonly offerIndex: number;
  readonly reelIndex: number;
  /** Null when the engine does not allow adding to this reel. */
  readonly preview: ReelEditPreview | null;
}

export interface OfferChoice {
  readonly offerIndex: number;
  readonly symbol: ReelSymbol;
  readonly candidates: readonly AddCandidate[];
}

export interface SymbolEditCandidate {
  readonly reelIndex: number;
  /** First index of this (action, grade) in the reel; any copy gives the same result. */
  readonly symbolIndex: number;
  readonly symbol: ReelSymbol;
  readonly count: number;
  /** Null when the engine does not allow this edit. */
  readonly preview: ReelEditPreview | null;
}

export interface SymbolEditChoices {
  readonly deletions: readonly SymbolEditCandidate[];
  readonly enhancements: readonly SymbolEditCandidate[];
}

/** Previews of many edits to the same reels share one analysis of the unedited reels. */
class EditPreviewer {
  private readonly options: AnalyzeOptions;
  private readonly before: ReelAnalysis;

  constructor(private readonly run: Run) {
    this.options = analysisOptions(run);
    this.before = analyzeReels(run.state.reels, this.options);
  }

  preview(edit: ReelEdit): ReelEditPreview {
    return { before: this.before, after: analyzeEdit(this.run.state.reels, edit, this.options) };
  }
}

/** reward_add: offers x reels (at most 9 previews). */
export function offerChoices(run: Run): OfferChoice[] {
  const { offers, reels } = run.state;
  if (!offers) {
    return [];
  }
  const previewer = new EditPreviewer(run);
  return offers.map((symbol, offerIndex) => ({
    offerIndex,
    symbol,
    candidates: reels.map((_, reelIndex) => ({
      offerIndex,
      reelIndex,
      preview: canAddToReel(run, reelIndex) ? previewer.preview({ kind: 'add', reelIndex, symbol }) : null,
    })),
  }));
}

/** reward_edit: one delete and one enhance candidate per reel x distinct symbol kind. */
export function symbolEditChoices(run: Run): SymbolEditChoices {
  const previewer = new EditPreviewer(run);
  const targets = run.state.reels.flatMap((reel, reelIndex) =>
    reelComposition(reel).map((entry) => ({
      reelIndex,
      symbolIndex: reel.findIndex((symbol) => symbol.actionId === entry.actionId && symbol.grade === entry.grade),
      symbol: { actionId: entry.actionId, grade: entry.grade },
      count: entry.count,
    })),
  );
  return {
    deletions: targets.map((target) => ({
      ...target,
      preview: canDeleteFromReel(run, target.reelIndex) ? previewer.preview(editOf('delete', target)) : null,
    })),
    enhancements: targets.map((target) => ({
      ...target,
      preview: canEnhanceSymbol(run, target.reelIndex, target.symbolIndex)
        ? previewer.preview(editOf('enhance', target))
        : null,
    })),
  };
}

function editOf(kind: 'delete' | 'enhance', target: { readonly reelIndex: number; readonly symbolIndex: number }): ReelEdit {
  return { kind, reelIndex: target.reelIndex, symbolIndex: target.symbolIndex };
}
