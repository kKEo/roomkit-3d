import { describe, it, expect } from 'vitest';
import { META_SDK } from '../src/prefabs/metaSdk.js';
import { normalisePrefab } from '../src/prefabs/registry.js';
import * as lamp from '../public/scenes/loft/prefabs/lamp.js';

/** The sample scene-shipped prefab follows the module contract; its component is never run in Node. */
describe('scene prefab contract (public/scenes/loft/prefabs/lamp.js)', () => {
  it('meta(META_SDK) normalises into a registry entry', () => {
    const m = normalisePrefab('lamp', lamp.meta(META_SDK));
    expect(m.props).toEqual({ height: 1.8, lit: true, spin: 0.3 });
    expect(m.hotspots(m.props)).toEqual(['shade']);
    expect(m.placement(m.props).focus[1]).toBeCloseTo(1.26);
  });

  it('component is a factory of one argument, left alone here', () => {
    expect(typeof lamp.component).toBe('function');
    expect(lamp.component.length).toBe(1);
  });

  it('META_SDK carries no React or three.js', () => {
    expect(Object.keys(META_SDK).sort()).toEqual(['SCREEN_SOURCES', 'SHAPES', 'screenOrSource', 'screenSchema', 'z']);
  });
});
