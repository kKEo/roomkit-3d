import { describe, it, expect } from 'vitest';
import { deepMerge, isPlainObject, SCENE_DEFAULTS } from '../src/config/defaults.js';

describe('isPlainObject', () => {
  it('accepts object literals only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });
});

describe('deepMerge', () => {
  it('merges nested objects key by key', () => {
    const out = deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 } });
    expect(out).toEqual({ a: { x: 1, y: 3 }, b: 1 });
  });

  it('replaces arrays and scalars instead of merging them', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
    expect(deepMerge({ n: 1 }, { n: 2 })).toEqual({ n: 2 });
  });

  it('keeps the base when the override is undefined', () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(deepMerge({ a: { b: 1 } }, { a: undefined })).toEqual({ a: { b: 1 } });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { b: 1 } }, over = { a: { c: 2 } };
    deepMerge(base, over);
    expect(base).toEqual({ a: { b: 1 } });
    expect(over).toEqual({ a: { c: 2 } });
  });

  it('lets a scene override a single theme key and keep the rest', () => {
    const out = deepMerge(SCENE_DEFAULTS, { theme: { accent: '#ffb000' } });
    expect(out.theme.accent).toBe('#ffb000');
    expect(out.theme.fonts).toEqual(SCENE_DEFAULTS.theme.fonts);
    expect(out.ui.ease.quint).toBe(SCENE_DEFAULTS.ui.ease.quint);
  });
});
