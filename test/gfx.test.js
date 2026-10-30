import { describe, it, expect } from 'vitest';
import { loadGfx, saveGfx, dprOf, GFX_DEFAULTS } from '../src/lib/gfx.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('gfx preferences', () => {
  it('falls back to the defaults with no storage, empty storage or corrupt data', () => {
    expect(loadGfx(undefined)).toEqual(GFX_DEFAULTS);
    expect(loadGfx(memory())).toEqual(GFX_DEFAULTS);
    expect(loadGfx(memory({ 'roomkit.gfx': '{nope' }))).toEqual(GFX_DEFAULTS);
  });

  it('round-trips valid values and drops invalid ones', () => {
    const s = memory();
    saveGfx({ ...GFX_DEFAULTS, dpr: 0.75, fps: 30, hud: true }, s);
    expect(loadGfx(s)).toEqual({ ...GFX_DEFAULTS, dpr: 0.75, fps: 30, hud: true });
    const bad = memory({ 'roomkit.gfx': JSON.stringify({ dpr: 7, fps: 'fast', antialias: 'yes', power: 'max', particles: 0 }) });
    expect(loadGfx(bad)).toEqual({ ...GFX_DEFAULTS, particles: 0 });
  });

  it('survives a storage that throws', () => {
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadGfx(throwing)).toEqual(GFX_DEFAULTS);
    expect(() => saveGfx(GFX_DEFAULTS, throwing)).not.toThrow();
  });

  it('maps auto to the 1–2 range and keeps fixed scales', () => {
    expect(dprOf({ dpr: 'auto' })).toEqual([1, 2]);
    expect(dprOf({ dpr: 0.5 })).toBe(0.5);
  });
});
