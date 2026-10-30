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
