/** Random source returning a float in [0, 1). Always injected so battles are reproducible. */
export type Rng = () => number;

const UINT32_RANGE = 2 ** 32;

/** Seedable mulberry32 generator. Same seed, same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** One rng call checked against the [0, 1) contract; NaN fails both comparisons, so it is rejected too. */
export function drawUnit(rng: Rng): number {
  const value = rng();
  if (!(value >= 0 && value < 1)) {
    throw new Error(`rng returned ${value}, expected a value in [0, 1)`);
  }
  return value;
}
