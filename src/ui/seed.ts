/** Live-game seed: crypto when available, otherwise the clock. Tests inject their own seeds instead. */
export function createLiveSeed(): number {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    return Date.now();
  }
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value ?? Date.now();
}
