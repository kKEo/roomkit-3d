import { describe, it, expect } from 'vitest';
import { satisfies, validRange } from '../src/lib/semver.js';

describe('semver: what a prefab\'s `requires` may say', () => {
  it.each([
    ['1.0.0', '^1.0.0', true],
    ['1.4.2', '^1.2.0', true],
    ['1.1.0', '^1.2.0', false],
    ['2.0.0', '^1.2.0', false],
    ['1.2.3', '1.2.3', true],
    ['1.3.0', '1.2', true],
    ['1.0.0', '1', true],
    ['2.0.0', '1', false],
    ['3.1.0', '>=1.2.0', true],
    ['1.1.9', '>=1.2.0', false],
    ['0.9.0', '*', true],
    ['1.0.0', 'latest', false],
    ['x', '^1.0.0', false],
  ])('%s satisfies %s → %s', (v, r, ok) => {
    expect(satisfies(v, r)).toBe(ok);
  });

  it('validRange knows ^, >=, exact, partial and *', () => {
    for (const r of ['^1.0.0', '>=2.1', '1.2.3', '1', '*', 'v1.0.0']) expect(validRange(r), r).toBe(true);
    for (const r of ['latest', '~1.0.0', '1.x', '', '>1.0.0']) expect(validRange(r), r).toBe(false);
  });
});
