import { describe, it, expect } from 'vitest';
import { PREFABS, PREFAB_TYPES } from '../src/prefabs/registry.js';

describe('PREFABS', () => {
  it.each(PREFAB_TYPES)('%s: defaults validate, unknown keys are rejected, placement is finite', type => {
    const m = PREFABS[type];
    expect(m.schema.parse({})).toEqual(m.props);
    expect(m.schema.safeParse({ notAProp: 1 }).success).toBe(false);
    expect(Array.isArray(m.media)).toBe(true);
    const h = m.placement(m.props);
    for (const v of [...h.focus, ...h.markerOffset, h.cameraDistance, h.cameraHeight ?? 0]) expect(Number.isFinite(v)).toBe(true);
  });

  it('media keys point at string-or-null props that exist', () => {
    for (const type of PREFAB_TYPES) {
      for (const key of PREFABS[type].media) {
        const [head] = key.split('.');
        expect(head.replace('[]', '') in PREFABS[type].props, `${type}.${key}`).toBe(true);
      }
    }
  });
});
