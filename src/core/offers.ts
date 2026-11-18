// Reward symbol offers (M2 spec 2).
import { drawUnit, type Rng } from './rng';
import type { ReelSymbol, RunRules } from './types';

export interface RewardCandidate {
  readonly symbol: ReelSymbol;
  readonly weight: number;
}

/**
 * Weighted candidates after clearing `cleared` battles, in the fixed spec 2.1 order:
 * actions in actionWeights order (outer), grades in table order (inner). Zero weights are dropped.
 */
export function rewardCandidates(rules: RunRules, cleared: number): RewardCandidate[] {
  const gradeWeights = rules.gradeWeightsByCleared[cleared];
  if (!gradeWeights) {
    throw new Error(`rewardCandidates: no grade weights for ${cleared} battles cleared`);
  }
  return rules.actionWeights.flatMap(({ actionId, weight: actionWeight }) =>
    gradeWeights
      .map(({ grade, weight }) => ({ symbol: { actionId, grade }, weight: actionWeight * weight }))
      .filter((candidate) => candidate.weight > 0),
  );
}

/**
 * Draws rules.offerCount distinct symbols without replacement, calling rng exactly once per offer.
 * Offers are returned in draw order.
 */
export function drawOffers(rules: RunRules, cleared: number, rng: Rng): ReelSymbol[] {
  const remaining = rewardCandidates(rules, cleared);
  if (remaining.length < rules.offerCount) {
    throw new Error(`drawOffers: ${remaining.length} candidates cannot fill ${rules.offerCount} offers`);
  }
  return Array.from({ length: rules.offerCount }, () => {
    const index = pickWeightedIndex(remaining, drawUnit(rng));
    const [picked] = remaining.splice(index, 1);
    return (picked as RewardCandidate).symbol;
  });
}

/** Walks the list subtracting weights; the first candidate that takes r below 0 wins, else the last one. */
function pickWeightedIndex(candidates: readonly RewardCandidate[], unit: number): number {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let r = unit * total;
  const index = candidates.findIndex((candidate) => {
    r -= candidate.weight;
    return r < 0;
  });
  return index === -1 ? candidates.length - 1 : index;
}
