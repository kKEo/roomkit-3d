import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { sceneSchema, poiSchema, objectSchema, makeSchemas, parseOrThrow, ConfigError } from '../src/config/schema.js';
import { createRegistry, normalisePrefab } from '../src/prefabs/registry.js';
import { SCENE_DEFAULTS, deepMerge } from '../src/config/defaults.js';

const minimalScene = raw => deepMerge(SCENE_DEFAULTS, raw);
const good = { id: 'start', label: 'Start', objects: [{ type: 'pedestal' }], content: { markdown: 'content/start.md' } };

describe('objectSchema', () => {
  it('fills position, rotation, scale and the prefab default props', () => {
    expect(objectSchema.parse({ type: 'bench' })).toEqual({
      type: 'bench', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, props: { width: 5.6, height: 0.7, depth: 0.9 }, actions: {},
    });
  });

  it('merges given props over the defaults', () => {
    expect(objectSchema.parse({ type: 'bench', props: { width: 2 } }).props).toEqual({ width: 2, height: 0.7, depth: 0.9 });
  });

  it('rejects unknown types and lists the known ones', () => {
    const r = objectSchema.safeParse({ type: 'lamp' });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/unknown object type "lamp" \(known: .*bench.*\)/);
  });

  it('rejects unknown and mistyped props under the props path', () => {
    const r = objectSchema.safeParse({ type: 'wardrobe', props: { widht: 2, height: 'tall' } });
    expect(r.success).toBe(false);
    const paths = r.error.issues.map(i => i.path.join('.'));
    expect(paths).toContain('props.height');
    expect(r.error.issues.some(i => /Unrecognized key/.test(i.message) && /widht/.test(i.message))).toBe(true);
  });

  it('normalises a desk screen given as a bare source name', () => {
    const o = objectSchema.parse({ type: 'desk', props: { screen: 'image', src: 'media/x.svg' } });
    expect(o.props.screen).toMatchObject({ source: 'image', zoom: true });
    expect(o.props.src).toBe('media/x.svg');
  });

  it('rejects non-positive scale, scalar or per-axis', () => {
    expect(objectSchema.safeParse({ type: 'bench', scale: 0 }).success).toBe(false);
    expect(objectSchema.safeParse({ type: 'bench', scale: [1, 0, 1] }).success).toBe(false);
    expect(objectSchema.safeParse({ type: 'bench', scale: [1, 2, 3] }).success).toBe(true);
  });
});

describe('poiSchema', () => {

  it('accepts a minimal POI', () => {
    expect(poiSchema.safeParse(good).success).toBe(true);
  });

  it('requires at least one object', () => {
    const r = poiSchema.safeParse({ ...good, objects: [] });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/at least one object/);
  });

  it('restricts ids to url-safe characters', () => {
    expect(poiSchema.safeParse({ ...good, id: 'has space' }).success).toBe(false);
    expect(poiSchema.safeParse({ ...good, id: '-leading' }).success).toBe(false);
    expect(poiSchema.safeParse({ ...good, id: 'Ok_1-2' }).success).toBe(true);
  });

  it('accepts inline blocks as content', () => {
    const r = poiSchema.safeParse({ ...good, content: { blocks: [{ type: 'heading', text: 'Hi' }] } });
    expect(r.success).toBe(true);
  });
});

describe('sceneSchema', () => {
  it('accepts the defaults plus a poi list', () => {
    const r = sceneSchema.safeParse(minimalScene({ poi: ['poi/a.json'] }));
    expect(r.success).toBe(true);
    expect(r.data.room.width).toBe(30);
  });

  it('requires at least one poi file and one light', () => {
    expect(sceneSchema.safeParse(minimalScene({})).success).toBe(false);
    expect(sceneSchema.safeParse(minimalScene({ poi: ['a'], room: { lights: [] } })).success).toBe(false);
  });

  it('rejects unknown keys in every section, so a typo is never silently ignored', () => {
    for (const bad of [{ poi: ['a'], room: { hieght: 1 } }, { poi: ['a'], theme: { acent: '#fff' } }, { poi: ['a'], camera: { fov2: 1 } }, { poi: ['a'], effects: { warpp: 1 } }, { poi: ['a'], decor2: [] }]) {
      const r = sceneSchema.safeParse(minimalScene(bad));
      expect(r.success, JSON.stringify(bad)).toBe(false);
      expect(r.error.issues.some(i => /Unrecognized key/.test(i.message))).toBe(true);
    }
    expect(poiSchema.safeParse({ ...good, lable: 'x' }).success).toBe(false);
  });

  it('rejects an unknown ease', () => {
    const r = sceneSchema.safeParse(minimalScene({ poi: ['a'], effects: { ease: 'bounce' } }));
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['effects', 'ease']);
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data on success', () => {
    expect(parseOrThrow(objectSchema, { type: 'door' }, 'x.json').type).toBe('door');
  });

  it('throws a ConfigError with one "file › path: message" line per issue', () => {
    let err;
    try { parseOrThrow(poiSchema, { id: 'bad id', label: '', objects: [], content: { markdown: 'x' } }, 'neo/poi/a.json'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.lines.length).toBe(3);
    expect(err.lines).toContain('neo/poi/a.json › id: id may contain only letters, digits, "-" and "_"');
    expect(err.lines.find(l => l.startsWith('neo/poi/a.json › objects:'))).toMatch(/at least one object/);
    expect(err.message).toBe(err.lines.join('\n'));
  });
});

describe('makeSchemas with a scene registry', () => {
  const lamp = normalisePrefab('lamp', {
    schema: z.strictObject({ height: z.number().positive().default(1.8) }),
    hotspots: p => { if (p.height > 5) throw new Error('too tall'); return ['shade']; },
    placement: p => ({ focus: [0, p.height, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
  });
  const { objectSchema: withLamp, sceneSchema: sceneWithLamp } = makeSchemas(createRegistry({ lamp }));

  it('accepts the scene\'s own type and lists it among the known ones', () => {
    expect(withLamp.parse({ type: 'lamp' }).props).toEqual({ height: 1.8 });
    const r = withLamp.safeParse({ type: 'kiosk' });
    expect(r.error.issues[0].message).toMatch(/known: .*lamp\)/);
    expect(objectSchema.safeParse({ type: 'lamp' }).success).toBe(false);
  });

  it('binds actions to the scene prefab\'s hotspots and reports a failing hotspots()', () => {
    expect(withLamp.safeParse({ type: 'lamp', actions: { shade: { type: 'togglePanel' } } }).success).toBe(true);
    const bad = withLamp.safeParse({ type: 'lamp', actions: { base: { type: 'togglePanel' } } });
    expect(bad.error.issues[0].message).toMatch(/no hotspot "base"/);
    const thrown = withLamp.safeParse({ type: 'lamp', props: { height: 9 } });
    expect(thrown.error.issues[0].message).toMatch(/hotspots\(\) of "lamp" failed: too tall/);
  });

  it('sceneSchema takes a prefabs map and defaults it to {}', () => {
    expect(sceneSchema.parse(minimalScene({ poi: ['a'] })).prefabs).toEqual({});
    expect(sceneWithLamp.parse(minimalScene({ poi: ['a'], prefabs: { lamp: 'prefabs/lamp.js' }, decor: [{ type: 'lamp' }] })).decor[0].props).toEqual({ height: 1.8 });
    const r = sceneSchema.safeParse(minimalScene({ poi: ['a'], prefabs: { 'Bad-Name': 'x.js', ok: '' } }));
    expect(r.error.issues.map(i => i.path.join('.')).sort()).toEqual(['prefabs.Bad-Name', 'prefabs.ok']);
  });
});
