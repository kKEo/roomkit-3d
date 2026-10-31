import { describe, it, expect } from 'vitest';
import { buildScene, readerFromMap, resolveObjectMedia, isRelative } from '../src/config/buildScene.js';
import { ConfigError } from '../src/config/schema.js';

const resolveUrl = p => `scene://x/${p}`;
const json = o => JSON.stringify(o);

const files = new Map([
  ['scene.json', json({ title: 'T', room: { width: 10, height: 4, depth: 12 }, poi: ['poi/a.json', 'poi/b.json'], decor: [{ type: 'door' }] })],
  ['poi/a.json', json({ id: 'a', label: 'A', objects: [{ type: 'pedestal', position: [1, 0, 2] }], content: { markdown: 'content/a.md' } })],
  ['poi/b.json', json({
    id: 'b', label: 'B',
    objects: [{ type: 'desk', props: { screen: { source: 'image', src: 'media/pic.svg' } } }],
    camera: { position: [0, 2, 5], target: [0, 1, 0] }, marker: { position: [0, 3, 0] },
    content: { blocks: [{ type: 'heading', text: 'B' }, { type: 'stats', data: [{ value: 1, label: 'one' }] }] },
  })],
  ['content/a.md', '# A\n\nhello'],
]);

/** The fixture with `overrides` applied; an `undefined` value removes that file. */
const build = (overrides = {}) => {
  const m = new Map(files);
  for (const [k, v] of Object.entries(overrides)) v === undefined ? m.delete(k) : m.set(k, v);
  return buildScene({ name: 'x', read: readerFromMap(m), resolveUrl });
};

const fails = async (p) => { try { await p; } catch (e) { return e; } throw new Error('expected a ConfigError'); };

describe('buildScene', () => {
  it('builds a valid bundle: defaults, overview camera, auto placement, markdown content', async () => {
    const { scene, pois } = await build();
    expect(scene.name).toBe('x');
    expect(scene.title).toBe('T');
    expect(scene.theme.accent).toBe('#00ff66');
    expect(scene.camera.overview).toBeDefined();
    expect(scene.decor[0].props).toEqual({ width: 2.4, height: 4.2 });
    expect(pois.map(p => p.id)).toEqual(['a', 'b']);
    const a = pois[0];
    expect(a.file).toBe('poi/a.json');
    expect(a.camera.target[0]).toBeCloseTo(1);
    expect(a.marker).toBeDefined();
    expect(a.content).toEqual({ blocks: [{ type: 'markdown', text: '# A\n\nhello' }] });
  });

  it('keeps an explicit camera and marker, normalises blocks and resolves nested media', async () => {
    const { pois } = await build();
    const b = pois[1];
    expect(b.camera.position).toEqual([0, 2, 5]);
    expect(b.content.blocks[0]).toEqual({ type: 'heading', text: 'B' });
    expect(b.content.blocks[1].data[0]).toEqual({ value: '1', label: 'one' });
    expect(b.objects[0].props.screen.src).toBe('scene://x/media/pic.svg');
  });

  it('collects every problem across files into one ConfigError', async () => {
    const e = await fails(build({
      'poi/a.json': '{ not json',
      'poi/b.json': json({ id: 'b', label: 'B', objects: [{ type: 'desk', props: { chairs: true } }], content: { markdown: 'content/missing.md' } }),
    }));
    expect(e).toBeInstanceOf(ConfigError);
    expect(e.lines).toEqual(expect.arrayContaining([
      expect.stringMatching(/^x\/poi\/a\.json: invalid JSON — /),
      expect.stringMatching(/^x\/poi\/b\.json › objects\.0\.props: Unrecognized key.*chairs/),
    ]));
    expect(e.lines.length).toBe(2); // a missing markdown is not reported for a POI that already failed validation
  });

  it('reports a missing markdown file against the POI that referenced it', async () => {
    const e = await fails(build({ 'content/a.md': undefined }));
    expect(e.lines).toEqual(['x/poi/a.json › content.markdown: file not found']);
  });

  it('reports duplicate ids and a missing POI file', async () => {
    const e = await fails(build({ 'scene.json': json({ poi: ['poi/a.json', 'poi/a.json', 'poi/zzz.json'] }) }));
    expect(e.lines).toEqual(expect.arrayContaining([
      'x/poi/zzz.json: file not found',
      'x/poi/a.json › id: duplicate id "a"',
    ]));
  });

  it('accepts camera.start naming a POI and rejects an unknown one', async () => {
    const withStart = start => json({ title: 'T', room: { width: 10, height: 4, depth: 12 }, camera: { start }, poi: ['poi/a.json', 'poi/b.json'] });
    const { scene } = await build({ 'scene.json': withStart('b') });
    expect(scene.camera.start).toBe('b');
    const e = await fails(build({ 'scene.json': withStart('nope') }));
    expect(e.lines).toEqual(['x/scene.json › camera.start: no POI has the id "nope"']);
  });

  it('labels scene.json problems', async () => {
    let e = await fails(buildScene({ name: 'x', read: readerFromMap(new Map()), resolveUrl }));
    expect(e.lines).toEqual(['x/scene.json: file not found']);
    e = await fails(build({ 'scene.json': json({ poi: [], ui: { hnt: 'typo' } }) }));
    expect(e.lines).toEqual(expect.arrayContaining([
      'x/scene.json › poi: list at least one POI file',
      expect.stringMatching(/^x\/scene\.json › ui: Unrecognized key.*hnt/),
    ]));
  });

  it('wraps a non-config failure from read with the file label', async () => {
    const e = await fails(buildScene({ name: 'x', read: async () => { throw new TypeError('Failed to fetch'); }, resolveUrl }));
    expect(e.lines).toEqual(['x/scene.json: Failed to fetch']);
  });
});

describe('isRelative', () => {
  it('treats schemes and leading slashes as absolute', () => {
    expect(isRelative('media/a.png')).toBe(true);
    expect(isRelative('./a.png')).toBe(true);
    expect(isRelative('https://x/a.png')).toBe(false);
    expect(isRelative('data:image/png;base64,AA')).toBe(false);
    expect(isRelative('/a.png')).toBe(false);
    expect(isRelative(null)).toBe(false);
  });
});

describe('resolveObjectMedia', () => {
  it('resolves "src", "a.b" and "list[].prop" media keys and leaves absolute ones', () => {
    const o = {
      type: 'controlDesk',
      props: { screens: [{ source: 'image', src: 'media/a.svg' }, { source: 'rain' }, { source: 'video', src: 'https://cdn/x.mp4' }] },
    };
    const r = resolveObjectMedia(o, resolveUrl);
    expect(r.props.screens.map(s => s.src)).toEqual(['scene://x/media/a.svg', undefined, 'https://cdn/x.mp4']);
    expect(r.props.screens[1]).toBe(o.props.screens[1]); // untouched items keep identity
  });

  it('returns the same object when nothing needs resolving', () => {
    const o = { type: 'bench', props: { width: 1 } };
    expect(resolveObjectMedia(o, resolveUrl)).toBe(o);
  });
});

describe('buildScene with scene prefabs', () => {
  const lampModule = {
    meta: ({ z }) => ({
      schema: z.strictObject({ height: z.number().positive().default(1.8), glb: z.string().nullable().default(null) }),
      media: ['glb'],
      hotspots: ['shade'],
      placement: p => ({ focus: [0, p.height, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
    }),
    component: () => () => null,
  };
  const modules = { 'scene://x/prefabs/lamp.js': lampModule };
  const loadModule = async url => { if (url in modules) return modules[url]; throw new Error('Failed to fetch dynamically imported module'); };
  const sceneWith = (prefabs, decor) => json({ title: 'T', room: { width: 10, height: 4, depth: 12 }, poi: ['poi/a.json'], prefabs, decor });
  /** `lm` null = no loadModule at all. */
  const buildWith = (overrides, lm) => {
    const m = new Map(files);
    m.delete('poi/b.json');
    for (const [k, v] of Object.entries(overrides)) m.set(k, v);
    return buildScene({ name: 'x', read: readerFromMap(m), resolveUrl, loadModule: lm === null ? undefined : loadModule });
  };

  it('loads the module, validates objects with its schema, resolves its media against the scene and exposes the registry', async () => {
    const { scene } = await buildWith({ 'scene.json': sceneWith({ lamp: 'prefabs/lamp.js' }, [{ type: 'lamp', props: { glb: 'media/lamp.glb' }, actions: { shade: { type: 'togglePanel' } } }]) });
    expect(scene.prefabs).toEqual({ lamp: 'scene://x/prefabs/lamp.js' });
    expect(scene.registry.has('lamp')).toBe(true);
    expect(scene.registry.get('lamp').module).toBe(lampModule);
    expect(scene.decor[0].props).toEqual({ height: 1.8, glb: 'scene://x/media/lamp.glb' });
  });

  it('leaves an absolute module URL alone', async () => {
    modules['https://cdn.example/lamp.js'] = lampModule;
    const { scene } = await buildWith({ 'scene.json': sceneWith({ lamp: 'https://cdn.example/lamp.js' }) });
    expect(scene.prefabs.lamp).toBe('https://cdn.example/lamp.js');
  });

  it('a scene without prefabs has an empty map and the built-in registry types', async () => {
    const { scene } = await build();
    expect(scene.prefabs).toEqual({});
    expect(scene.registry.has('lamp')).toBe(false);
  });

  it.each([
    ['a module that fails to load', { lamp: 'prefabs/missing.js' }, /prefabs\.lamp: could not load scene:\/\/x\/prefabs\/missing\.js: Failed to fetch/],
    ['a module without meta', { lamp: 'prefabs/nometa.js' }, /prefabs\.lamp: .*module has no "meta" export/],
    ['a meta() that throws', { lamp: 'prefabs/throws.js' }, /prefabs\.lamp: meta\(\) failed: boom/],
    ['a schema without defaults', { lamp: 'prefabs/nodefaults.js' }, /prefabs\.lamp: defaults do not validate/],
    ['a built-in type name', { door: 'prefabs/lamp.js' }, /prefabs\.door: "door" is a built-in type/],
    ['a bad type name', { 'Lamp-1': 'prefabs/lamp.js' }, /prefabs\.Lamp-1: a type name is letters/],
    ['an empty path', { lamp: '' }, /prefabs\.lamp: give the path/],
  ])('reports %s as a scene.json › prefabs line', async (_, prefabs, re) => {
    modules['scene://x/prefabs/nometa.js'] = { component: () => null };
    modules['scene://x/prefabs/throws.js'] = { meta: () => { throw new Error('boom'); } };
    modules['scene://x/prefabs/nodefaults.js'] = { meta: ({ z }) => ({ ...lampModule.meta({ z }), schema: z.strictObject({ height: z.number() }) }) };
    const e = await fails(buildWith({ 'scene.json': sceneWith(prefabs) }));
    expect(e).toBeInstanceOf(ConfigError);
    expect(e.lines.filter(l => /prefabs/.test(l))).toHaveLength(1);
    expect(e.lines[0]).toMatch(/^x\/scene\.json › /);
    expect(e.lines[0]).toMatch(re);
  });

  it('without loadModule, declared prefabs are a config error', async () => {
    const e = await fails(buildWith({ 'scene.json': sceneWith({ lamp: 'prefabs/lamp.js' }) }, null));
    expect(e.lines).toEqual(['x/scene.json › prefabs.lamp: this build cannot load scene prefabs']);
  });

  it('a prefab failure and a POI error land in the same ConfigError, and the other prefab still loads', async () => {
    const e = await fails(buildWith({
      'scene.json': sceneWith({ lamp: 'prefabs/lamp.js', kiosk: 'prefabs/missing.js' }, [{ type: 'lamp' }]),
      'poi/a.json': '{ not json',
    }));
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0]).toMatch(/prefabs\.kiosk: could not load/);
    expect(e.lines[1]).toMatch(/poi\/a\.json: invalid JSON/);
  });

  it('objects of a prefab that failed to load are reported as unknown types, after the cause', async () => {
    const e = await fails(buildWith({ 'scene.json': sceneWith({ lamp: 'prefabs/lamp.js', kiosk: 'prefabs/missing.js' }, [{ type: 'lamp' }, { type: 'kiosk' }]) }));
    expect(e.lines[0]).toMatch(/prefabs\.kiosk: could not load/);
    expect(e.lines[1]).toMatch(/decor\.1\.type: unknown object type "kiosk" \(known: .*lamp\)/);
    expect(e.lines).toHaveLength(2);
  });
});

describe('buildScene with transforms and feeds', () => {
  const nodes = json => ({ rows: json.nodes });
  const modules = {
    'scene://x/data/feeds.js': { nodes, transform: j => j },
    'scene://x/data/broken.js': { other: 1 },
  };
  const loadModule = async url => {
    if (url in modules) return modules[url];
    throw new Error('Failed to fetch');
  };
  const sceneWith = (extra) => json({ title: 'T', poi: ['poi/a.json'], ...extra });
  const poiWith = (objects, content = { blocks: [{ type: 'heading', text: 'A' }] }) =>
    json({ id: 'a', label: 'A', objects, camera: { position: [0, 2, 5], target: [0, 1, 0] }, marker: { position: [0, 3, 0] }, content });
  const run = (sceneJson, poiJson, opts = {}) => buildScene({
    name: 'x', resolveUrl, loadModule, ...opts,
    read: readerFromMap(new Map([['scene.json', sceneJson], ['poi/a.json', poiJson]])),
  });

  it('loads named and default exports, keeps feeds on screens and blocks, and exposes resolveUrl', async () => {
    const { scene, pois } = await run(
      sceneWith({ transforms: { nodes: 'data/feeds.js#nodes', plain: 'data/feeds.js' } }),
      poiWith(
        [{ type: 'desk', props: { screen: { source: 'dashboard', feed: { url: 'data/n.json', refresh: 10, transform: 'nodes' } } } }],
        { blocks: [{ type: 'stats', feed: 'data/kpi.json' }] },
      ),
    );
    expect(scene.transforms.nodes.url).toBe('scene://x/data/feeds.js#nodes');
    expect(scene.transforms.nodes.fn).toBe(nodes);
    expect(scene.transforms.plain.url).toBe('scene://x/data/feeds.js#transform');
    expect(scene.resolveUrl('a.json')).toBe('scene://x/a.json');
    const feed = pois[0].objects[0].props.screen.feed;
    expect(feed).toMatchObject({ url: 'data/n.json', refresh: 10, transform: 'nodes' });
    expect(pois[0].content.blocks[0]).toMatchObject({ type: 'stats', feed: { url: 'data/kpi.json' } });
  });

  it('a scene without transforms has an empty map', async () => {
    const { scene } = await run(sceneWith({}), poiWith([{ type: 'pedestal' }]));
    expect(scene.transforms).toEqual({});
  });

  it.each([
    [{ bad: 'data/broken.js#nodes' }, 'transforms.bad: scene://x/data/broken.js: module has no "nodes" function export'],
    [{ bad: 'data/broken.js' }, 'transforms.bad: scene://x/data/broken.js: module has no "transform" function export'],
    [{ bad: 'data/missing.js' }, 'transforms.bad: could not load scene://x/data/missing.js: Failed to fetch'],
    [{ bad: 'data/feeds.js#' }, 'transforms.bad: write "path/to/module.js" or "path/to/module.js#exportName"'],
    [{ Bad: 'data/feeds.js' }, 'transforms.Bad: a transform name is letters, digits and "_", starting with a lowercase letter'],
  ])('reports %j', async (transforms, line) => {
    const e = await fails(run(sceneWith({ transforms }), poiWith([{ type: 'pedestal' }])));
    expect(e.lines).toEqual([`x/scene.json › ${line}`]);
  });

  it('without loadModule, declared transforms are a config error', async () => {
    const e = await fails(run(sceneWith({ transforms: { nodes: 'data/feeds.js' } }), poiWith([{ type: 'pedestal' }]), { loadModule: undefined }));
    expect(e.lines).toEqual(['x/scene.json › transforms.nodes: this build cannot load scene transforms']);
  });

  it('reports a feed whose transform is not declared, with its full path, in POIs, blocks and decor', async () => {
    const e = await fails(run(
      sceneWith({ transforms: { nodes: 'data/feeds.js#nodes' }, decor: [{ type: 'cinemaScreen', props: { screen: { source: 'text', feed: { url: 'k.json', transform: 'kpi' } } } }] }),
      poiWith(
        [{ type: 'controlDesk', props: { screens: [{}, { source: 'graph', feed: { url: 'g.json', transform: 'series' } }] } }],
        { blocks: [{ type: 'list', feed: { url: 'l.json', transform: 'items' } }] },
      ),
    ));
    expect(e.lines).toEqual(expect.arrayContaining([
      'x/scene.json › decor.0.props.screen.feed.transform: unknown transform "kpi" (known: nodes)',
      'x/poi/a.json › objects.0.props.screens.1.feed.transform: unknown transform "series" (known: nodes)',
      'x/poi/a.json › content.blocks.0.feed.transform: unknown transform "items" (known: nodes)',
    ]));
  });

  it('says so when a scene declares no transforms at all', async () => {
    const e = await fails(run(sceneWith({}), poiWith([{ type: 'desk', props: { screen: { source: 'text', feed: { url: 't.json', transform: 'x' } } } }])));
    expect(e.lines).toEqual(['x/poi/a.json › objects.0.props.screen.feed.transform: unknown transform "x" (none declared in scene.json › transforms)']);
  });

  it('a cinema screen takes a full screen config instead of source/src', async () => {
    const { pois } = await run(sceneWith({}), poiWith([{ type: 'cinemaScreen', props: { screen: { source: 'image', src: 'media/a.png' } } }]));
    expect(pois[0].objects[0].props.screen.src).toBe('scene://x/media/a.png');
  });
});
