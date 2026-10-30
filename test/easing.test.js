import { describe, it, expect } from 'vitest';
import { EASE, EASE_NAMES } from '../src/lib/easing.js';

describe('EASE', () => {
  it('lists every selectable curve', () => {
    for (const n of EASE_NAMES) expect(typeof EASE[n]).toBe('function');
  });

  it('every curve starts at 0 and ends at 1', () => {
    for (const f of Object.values(EASE)) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
  });

  it('non-overshooting curves are monotonic and pass through 0.5 at the midpoint', () => {
    for (const n of ['linear', 'sine', 'cubic', 'quint', 'expo']) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) { const v = EASE[n](i / 100); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
      expect(EASE[n](0.5)).toBeCloseTo(0.5, 6);
    }
  });

  it('back overshoots below 0 and above 1', () => {
    expect(EASE.back(0.15)).toBeLessThan(0);
    expect(EASE.back(0.85)).toBeGreaterThan(1);
  });
});
