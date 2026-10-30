import { describe, it, expect } from 'vitest';
import { fmt, pad2 } from '../src/lib/text.js';

describe('pad2', () => {
  it('pads to two digits', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(12)).toBe('12');
    expect(pad2(123)).toBe('123');
  });
});

describe('fmt', () => {
  it('substitutes {name} placeholders', () => {
    expect(fmt('{n} of {total}', { n: '01', total: '05' })).toBe('01 of 05');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(fmt('Go to {label} {missing}', { label: 'x' })).toBe('Go to x {missing}');
  });

  it('coerces a non-string template', () => {
    expect(fmt(42, {})).toBe('42');
  });
});
