import { describe, it, expect } from 'vitest';
import { lintPrefab, sampleProps, partLabel } from '../src/lint/prefabRules.js';
import { loadPrefab } from '../src/config/buildScene.js';
import { formatFinding } from '../src/lint/rules.js';

/**
 * Scene prefabs written here as modules in memory, one mistake each. A cube that follows `size`, stands on the
 * floor, is clickable as "body" and says what it is: the clean one. `meta` and `component` are merged over it.
 */
const cube = ({ h, Solid }) => ({ props }) => h(Solid, { name: 'cube', hotspot: 'body', args: [props.size, props.size, props.size], position: [0, props.size / 2, 0] });
const fixture = (meta = {}, component = cube, extra = {}) => ({
  meta: ({ z }) => ({
    schema: z.strictObject({ size: z.number().positive().default(1), ...extra }),
    hotspots: ['body'],
    title: 'Cube', blurb: 'a cube', glyph: '◻',
    geometry: p => ({ min: [-p.size / 2, 0, -p.size / 2], max: [p.size / 2, p.size, p.size / 2], mount: 'floor' }),
    placement: p => ({ focus: [0, p.size / 2, 0], cameraDistance: 5, cameraHeight: 2, markerOffset: [0, p.size + 0.5, 0] }),
    ...meta,
  }),
  component,
});
const entryOf = module => loadPrefab('thing', 'prefabs/thing.js', { resolveUrl: p => `file:///s/${p}`, loadModule: async () => module });
const lint = async (module, ctx = {}) => lintPrefab({ type: 'thing', entry: await entryOf(module), file: 's/prefabs/thing.js', ...ctx });
const said = async (module, ctx) => (await lint(module, ctx)).map(f => `${f.level} ${f.code} ${f.path}: ${f.message}`);

describe('prefab checks', () => {
  it('finds nothing in a prefab whose meta tells the truth', async () => {
    expect(await lint(fixture())).toEqual([]);
  });

  it('a part outside the declared box, at rest', async () => {
    const lines = await lint(fixture({}, ({ h, Solid }) => ({ props }) => h('group', null, h(cube({ h, Solid }), { props }), h(Solid, { name: 'arm', args: [0.2, 0.2, 0.2], position: [2, 0.5, 0] }))));
    // each face is reported once, at the props where it is worst: here the smallest cube
    expect(lines.map(formatFinding)).toEqual([
      'warn  PREFAB_GEO_SMALL  s/prefabs/thing.js › geometry: "arm" reaches x 2.1 with { "size": 0.5 }, 1.85 m past the declared box (max x 0.25) (make `geometry` contain every solid part for every prop: scene checks and placement by wall trust it)',
      'warn  PREFAB_GEO_SMALL  s/prefabs/thing.js › geometry: "arm" reaches y 0.6 with { "size": 0.5 }, 0.1 m past the declared box (max y 0.5) (make `geometry` contain every solid part for every prop: scene checks and placement by wall trust it)',
    ]);
  });

  it('a box that does not follow a prop is caught at the prop\'s other values', async () => {
    const fixed = fixture({ geometry: () => ({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], mount: 'floor' }) });
    expect(await said(fixed)).toEqual([
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches x -1 with { "size": 2 }, 0.5 m past the declared box (min x -0.5)',
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches x 1 with { "size": 2 }, 0.5 m past the declared box (max x 0.5)',
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches y 2 with { "size": 2 }, 1 m past the declared box (max y 1)',
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches z -1 with { "size": 2 }, 0.5 m past the declared box (min z -0.5)',
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches z 1 with { "size": 2 }, 0.5 m past the declared box (max z 0.5)',
    ]);
  });

  it('no geometry at all: the measured box is offered, ready to paste', async () => {
    const [f] = await lint(fixture({ geometry: undefined }));
    expect([f.code, f.level, f.hint]).toEqual(['PREFAB_GEO_MISSING', 'warn', 'with default props its parts measure min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5]; add e.g. geometry: p => ({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], mount: \'floor\' }) and make it follow the size props']);
  });

  it('a box far larger than its parts is a note, not a warning', async () => {
    const roomy = fixture({ geometry: p => ({ min: [-p.size / 2, 0, -p.size / 2], max: [p.size / 2 + 3, p.size, p.size / 2], mount: 'floor' }) });
    expect(await said(roomy)).toEqual(['info PREFAB_GEO_LARGE geometry: the declared box is 3 m larger than its parts on +x']);
  });

  it('what it stands on: a floor object that floats, a wall object with parts behind the wall', async () => {
    const floats = fixture({}, ({ h, Solid }) => ({ props }) => h(Solid, { hotspot: 'body', args: [props.size, props.size / 2, props.size], position: [0, props.size * 0.75, 0] }));
    expect(await said(floats)).toEqual(['warn PREFAB_MOUNT geometry: it is declared to stand on the floor, but its lowest part is at y 0.5 and its box starts at y 0']);
    const through = fixture({ geometry: p => ({ min: [-p.size / 2, 0, 0], max: [p.size / 2, p.size, p.size / 2], mount: 'wall' }) });
    expect(await said(through)).toEqual([
      'warn PREFAB_MOUNT geometry: it is declared to hang on a wall, but its parts start at z -0.5 and its box at z 0',
      'warn PREFAB_GEO_SMALL geometry: "cube" reaches z -1 with { "size": 2 }, 1 m past the declared box (min z 0)',
    ]);
  });

  it('clickable parts: one the meta does not list, one it lists that no part has', async () => {
    const lines = await said(fixture({ hotspots: ['body', 'lid'] }, ({ h, Solid }) => ({ props }) => h(Solid, { hotspot: 'handle', args: [props.size, props.size, props.size], position: [0, props.size / 2, 0] })));
    expect(lines).toEqual([
      'warn PREFAB_HOTSPOT hotspots: a part asks for "handle", which the meta\'s `hotspots` does not list (it lists: body, lid)',
      'warn PREFAB_HOTSPOT hotspots: the meta lists "body", "lid", but no part has that name (parts ask for: handle)',
    ]);
  });

  it('a screen is clickable by its id', async () => {
    const screen = fixture({ hotspots: ['body', 'panel'] }, ({ h, Solid, ScreenSurface }) => ({ props }) => h('group', null,
      h(cube({ h, Solid }), { props }), h(ScreenSurface, { id: 'panel', source: 'text', w: props.size * 0.8, h: props.size * 0.5, position: [0, props.size / 2, props.size / 2 + 0.01] })));
    expect(await lint(screen)).toEqual([]);
  });

  it('motion: a part that turns although the visitor asked for less, and one that leaves its box while moving', async () => {
    const spin = respect => fixture({}, ({ h, Solid, useRef, useFrame, reducedMotion }) => ({ props }) => {
      const ref = useRef();
      useFrame((_, dt) => { if (respect && reducedMotion) return; ref.current.rotation.y += dt; });
      return h(Solid, { ref, name: 'cube', hotspot: 'body', shape: 'cylinder', args: [props.size / 2, props.size / 2, props.size, 12], position: [0, props.size / 2, 0] });
    });
    expect(await lint(spin(true))).toEqual([]);
    expect(await said(spin(false))).toEqual(['warn PREFAB_MOTION component: "cube" still moves with reduced motion']);

    const rises = fixture({}, ({ h, Solid, useRef, useFrame, reducedMotion }) => ({ props }) => {
      const ref = useRef();
      useFrame(({ clock }) => { if (!reducedMotion) ref.current.position.y = props.size / 2 + Math.abs(Math.sin(clock.elapsedTime)) * 0.4; });
      return h(Solid, { ref, name: 'cube', hotspot: 'body', args: [props.size, props.size, props.size], position: [0, props.size / 2, 0] });
    });
    expect(await said(rises)).toEqual([expect.stringMatching(/^warn PREFAB_GEO_SMALL geometry: "cube" reaches y 1\.\d+ while it moves, 0\.\d+ m past the declared box \(max y 1\)$/)]);
  });

  it('a material of its own', async () => {
    const own = fixture({}, ({ h }) => ({ props }) => h('mesh', { position: [0, props.size / 2, 0] }, h('boxGeometry', { args: [props.size, props.size, props.size] }), h('meshBasicMaterial')));
    expect(await said(own)).toEqual([
      'warn PREFAB_HOTSPOT hotspots: the meta lists "body", but no part has that name (parts ask for: none)',
      'warn PREFAB_MATERIAL component: mesh (part 1) is drawn with a material of its own',
    ]);
  });

  it('what throws: the factory, a render for some props, a useFrame callback', async () => {
    expect(await said(fixture({}, () => { throw new Error('no sdk.Sold'); }))).toEqual(['error PREFAB_THROWS component: component(sdk) fails: no sdk.Sold']);
    expect(await said(fixture({}, () => 42))).toEqual(['error PREFAB_THROWS component: component(sdk) fails: component() did not return a component']);
    const big = fixture({}, ({ h, Solid }) => ({ props }) => { if (props.size > 1.5) throw new Error('too big'); return h(cube({ h, Solid }), { props }); });
    expect(await said(big)).toEqual(['error PREFAB_THROWS component: it throws while rendering with { "size": 2 }: too big']);
    const frame = fixture({}, ({ h, Solid, useFrame }) => ({ props }) => { useFrame(() => { throw new Error('ref is null'); }); return h(cube({ h, Solid }), { props }); });
    expect(await said(frame)).toEqual(['error PREFAB_THROWS component: a useFrame callback throws: ref is null']);
  });

  it('what React says: a hook that comes and goes with a prop, list items without keys', async () => {
    // the same component is re-rendered with each prop changed, as the editor does: a hook inside an `if` shows then
    const hooks = fixture({}, ({ h, Solid, useRef, useMemo }) => ({ props }) => { useMemo(() => 1, []); if (props.lit) useRef(); return h(cube({ h, Solid }), { props }); });
    const withLit = { meta: sdk => ({ ...hooks.meta(sdk), schema: sdk.z.strictObject({ size: sdk.z.number().positive().default(1), lit: sdk.z.boolean().default(true) }) }), component: hooks.component };
    expect(await said(withLit)).toEqual(['error PREFAB_THROWS component: it throws while rendering with { "lit": false }: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.']);

    const keys = fixture({}, ({ h, Solid }) => ({ props }) => h('group', null, [0, 1].map(i => h(Solid, { hotspot: 'body', args: [props.size / 2, props.size, props.size], position: [(i - 0.5) * props.size / 2, props.size / 2, 0] }))));
    expect(await said(keys)).toEqual([expect.stringMatching(/^warn PREFAB_REACT component: .*unique "key" prop/)]);
  });

  it('a camera hint that would cut the object off, with a distance that would not', async () => {
    const close = fixture({ placement: p => ({ focus: [0, p.size / 2, 0], cameraDistance: 0.6, cameraHeight: 0.5, markerOffset: [0, p.size + 0.5, 0] }) });
    expect((await lint(close)).map(f => `${f.code}: ${f.message} (${f.hint})`)).toEqual(['PREFAB_PLACEMENT: a stop\'s automatic camera, 0.6 m in front of it, cuts it off (a cameraDistance of about 2.5 shows all of it)']);
    const far = fixture({ placement: p => ({ focus: [0, p.size / 2, 0], cameraDistance: 60, cameraHeight: 2, markerOffset: [0, p.size + 0.5, 0] }) });
    expect(await said(far)).toEqual(['warn PREFAB_PLACEMENT placement: from a stop\'s automatic camera, 60 m away, it fills 0.01% of the picture']);
  });

  it('its own files: a model that is not there, and one that is but cannot be measured here', async () => {
    const model = fixture({}, ({ h, Solid, useModel, assetUrl }) => ({ props }) => h('group', null, h(cube({ h, Solid }), { props }), h('primitive', { object: useModel(assetUrl('statue.glb')) })));
    const ctx = { sceneUrl: 'file:///s/', exists: async p => p !== 'prefabs/statue.glb' };
    expect(await said(model, ctx)).toEqual([
      'info PREFAB_UNMEASURED component: a glTF model is not loaded here: its size is not measured, so check `geometry` by hand',
      'error PREFAB_ASSET component: it names "statue.glb" through assetUrl, which is not next to the module',
    ]);
    expect(await said(model, { sceneUrl: 'file:///s/', exists: async () => true })).toEqual(['info PREFAB_UNMEASURED component: a glTF model is not loaded here: its size is not measured, so check `geometry` by hand']);
  });

  it('the source: an import, which a page could not resolve', async () => {
    const ok = 'export function meta() {}\n// import nothing\nexport function component() {}\nconst s = "important";';
    expect(await said(fixture(), { source: ok })).toEqual([]);
    for (const bad of ['import * as THREE from "three";\n', 'import { z } from "zod";', '  import "./side-effect.js"', 'const React = require("react");']) {
      expect(await said(fixture(), { source: `${bad}\n${ok}` }), bad).toEqual(['error PREFAB_SOURCE : the module imports something']);
    }
  });

  it('a prefab that does not say what it is', async () => {
    expect(await said(fixture({ title: undefined, glyph: undefined }))).toEqual(['info PREFAB_UNTITLED : the meta gives no title, glyph']);
  });

  it('tries each prop in turn: low and high numbers, the other side of a tick box, the other choices', async () => {
    const z = (await import('zod')).z;
    const entry = { props: { width: 2, count: 4, lit: true, kind: 'a', riser: 0, recline: 22, label: 'x' }, schema: z.strictObject({
      width: z.number().positive().default(2), count: z.number().int().positive().default(4), lit: z.boolean().default(true), kind: z.enum(['a', 'b', 'c']).default('a'),
      riser: z.number().min(0).default(0), recline: z.number().min(0).max(60).default(22), label: z.string().default('x'),
    }) };
    expect(sampleProps(entry).map(s => s.with)).toEqual([
      '', ' with { "width": 1 }', ' with { "width": 4 }', ' with { "count": 1 }', ' with { "count": 8 }', ' with { "lit": false }', ' with { "kind": "b" }', ' with { "kind": "c" }',
      ' with { "riser": 1 }', ' with { "recline": 0 }', ' with { "recline": 60 }',
    ]);
    expect(sampleProps(entry)[4].props).toMatchObject({ width: 2, count: 8, lit: true });
    expect([partLabel({ name: 'arm' }, 0), partLabel({ kind: 'solid', shape: 'cone' }, 2), partLabel({ kind: 'lines' }, 3)]).toEqual(['"arm"', 'cone (part 3)', 'lines (part 4)']);
  });
});
