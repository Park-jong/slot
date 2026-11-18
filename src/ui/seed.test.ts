import { describe, expect, it } from 'vitest';
import { isDebugEnabled } from './seed';

describe('isDebugEnabled', () => {
  it('needs both a dev build and the debug flag in the URL', () => {
    expect(isDebugEnabled('?debug', true)).toBe(true);
    expect(isDebugEnabled('', true)).toBe(false);
    expect(isDebugEnabled('?debug', false)).toBe(false);
  });
});
