import { DEBUG_QUERY_PARAM } from './ui-config';

/** Live-game seed: crypto when available, otherwise the clock. Tests inject their own seeds instead. */
export function createLiveSeed(): number {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    return Date.now();
  }
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value ?? Date.now();
}

/** Debug display (seed) needs a dev build AND the debug flag in the page URL. */
export function isDebugEnabled(search: string, isDevBuild: boolean): boolean {
  return isDevBuild && new URLSearchParams(search).has(DEBUG_QUERY_PARAM);
}
