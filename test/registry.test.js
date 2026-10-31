import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PREFABS, PREFAB_TYPES, BUILTIN, BUILTIN_REGISTRY, createRegistry, normalisePrefab } from '../src/prefabs/registry.js';

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

describe('normalisePrefab and registries', () => {
  const lamp = {
    schema: z.strictObject({ height: z.number().positive().default(1.8) }),
    hotspots: ['shade'],
    placement: p => ({ focus: [0, p.height, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
  };

  it('fills media, props and a hotspots function, and keeps extra fields', () => {
    const m = normalisePrefab('lamp', { ...lamp, url: 'u' });
    expect(m.props).toEqual({ height: 1.8 });
    expect(m.media).toEqual([]);
    expect(m.hotspots(m.props)).toEqual(['shade']);
    expect(m.url).toBe('u');
  });

  it.each([
    ['Lamp', lamp, /not a valid type name/],
    ['lamp', { ...lamp, schema: z.strictObject({ height: z.number() }) }, /defaults do not validate/],
    ['lamp', { ...lamp, schema: {} }, /"schema" must be a zod schema/],
    ['lamp', { ...lamp, placement: { focus: [0, 0, 0] } }, /"placement" must be a function/],
    ['lamp', { ...lamp, placement: () => ({ focus: [0, NaN, 0], markerOffset: [0, 0, 0], cameraDistance: 1 }) }, /finite numbers/],
    ['lamp', { ...lamp, media: 'src' }, /"media" must be a list/],
    ['lamp', { ...lamp, hotspots: () => [1] }, /"hotspots" must give a list of names/],
  ])('rejects bad meta (%s)', (type, meta, re) => {
    expect(() => normalisePrefab(type, meta)).toThrow(re);
  });

  it('createRegistry lays a scene\'s types over the built-ins without touching them', () => {
    const reg = createRegistry({ lamp: normalisePrefab('lamp', lamp) });
    expect(reg.types()).toEqual([...PREFAB_TYPES, 'lamp']);
    expect(reg.has('lamp')).toBe(true);
    expect(reg.get('lamp').props).toEqual({ height: 1.8 });
    expect(reg.get('door')).toBe(BUILTIN.door);
    expect(Object.keys(reg.extra)).toEqual(['lamp']);
    expect(BUILTIN_REGISTRY.has('lamp')).toBe(false);
    expect(Object.isFrozen(reg)).toBe(true);
  });
});
