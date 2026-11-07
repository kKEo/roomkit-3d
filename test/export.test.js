import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildScene } from '../src/config/buildScene.js';
import { exportOptions, withExportOptions, sceneRefs, bundleEntries, indexJson } from '../src/editor/export.js';

const ROOT = join(import.meta.dirname, '..', 'public', 'scenes');
const json = o => JSON.stringify(o, null, 2) + '\n';

/** A shipped scene as the editor holds it: its text files in a Map, plus the registry of its built scene. */
async function shipped(name) {
  const dir = join(ROOT, name);
  const read = async p => readFile(join(dir, p), 'utf8');
  const files = new Map([['scene.json', await read('scene.json')]]);
  for (const f of JSON.parse(files.get('scene.json')).poi) {
    files.set(f, await read(f));
    const md = JSON.parse(files.get(f)).content?.markdown;
    if (md) files.set(md, await read(md));
  }
  const { scene } = await buildScene({ name, read, resolveUrl: p => pathToFileURL(join(dir, p)).href, loadModule: url => import(url) });
  return { files, registry: scene.registry };
}

describe('export options', () => {
  const files = new Map([['scene.json', json({ title: 'T', camera: { fov: 50 }, poi: ['poi/a.json'] })]]);

  it('reads the defaults when scene.json says nothing', () => {
    expect(exportOptions(files)).toEqual({ freeFly: true, start: null });
    expect(exportOptions(new Map())).toEqual({ freeFly: true, start: null });
  });

  it('writes freeFly and start into camera, keeps the other keys, and removes the defaults again', () => {
    const pose = { position: [1, 2, 3], target: [0, 1, 0] };
    const off = withExportOptions(files, { freeFly: false, start: pose });
    expect(JSON.parse(off.get('scene.json')).camera).toEqual({ fov: 50, freeFly: false, start: pose });
    expect(exportOptions(off)).toEqual({ freeFly: false, start: pose });
    expect(files.get('scene.json')).toContain('"fov": 50'); // the input Map is untouched
    const back = withExportOptions(off, { freeFly: true, start: null });
    expect(JSON.parse(back.get('scene.json')).camera).toEqual({ fov: 50 });
    const poi = withExportOptions(files, { freeFly: true, start: 'lobby' });
    expect(exportOptions(poi).start).toBe('lobby');
  });

  it('drops an empty camera block and leaves broken JSON alone', () => {
    const bare = new Map([['scene.json', json({ title: 'T', poi: ['poi/a.json'] })]]);
    expect(JSON.parse(withExportOptions(bare, { freeFly: true, start: null }).get('scene.json'))).toEqual({ title: 'T', poi: ['poi/a.json'] });
    const broken = new Map([['scene.json', '{ not json']]);
    expect(withExportOptions(broken, { freeFly: false, start: null })).toBe(broken);
  });
});

describe('sceneRefs', () => {
  it('finds the modules, media and local feeds of the cinema scene, not its openUrl links', async () => {
    const { files, registry } = await shipped('cinema');
    expect(sceneRefs(files, registry)).toEqual([
      'data/showtimes.json', 'data/transforms.js',
      'media/intro.mp4', 'media/poster-live.svg', 'media/poster-scenes.svg', 'media/poster-screens.svg',
      'prefabs/projector.js', 'prefabs/seats.js',
    ]);
  });

  it('finds the control-desk media and the node feed of neo-room, once each', async () => {
    const { files, registry } = await shipped('neo-room');
    expect(sceneRefs(files, registry)).toEqual(['data/nodes.json', 'data/transforms.js', 'media/floorplan.svg']);
  });

  it('skips absolute URLs, files already in the bundle and unknown object types; reads fenced feeds', () => {
    const files = new Map([
      ['scene.json', json({ prefabs: { lamp: 'prefabs/lamp.js' }, transforms: { t: 'https://cdn.example/t.js#t' }, decor: [{ type: 'pictureFrame', props: { image: 'https://img.example/a.png' } }, { type: 'nope', props: { src: 'media/x.svg' } }], poi: ['poi/a.json'] })],
      ['poi/a.json', json({ id: 'a', objects: [{ type: 'desk', props: { screen: { source: 'stats', feed: { url: './data/kpi.json', stream: '/abs/sse' } } } }], content: { markdown: 'content/a.md', blocks: [{ type: 'list', feed: 'data/list.json' }] } })],
      ['content/a.md', '# A\n\n```stats\n{ "feed": "data/kpi.json" }\n```\n\n```js\nnot a feed\n```\n'],
      ['data/list.json', '[]'],
    ]);
    expect(sceneRefs(files)).toEqual(['data/kpi.json', 'prefabs/lamp.js']);
  });

  it('survives broken files', () => {
    expect(sceneRefs(new Map([['scene.json', '{'], ['poi/a.json', 'nope'], ['content/a.md', '```stats\n{\n```']]))).toEqual([]);
  });
});

describe('bundleEntries', () => {
  it('lays out the viewer at the root and the scene under scenes/<name>/ with an index naming it', () => {
    const files = new Map([['scene.json', '{}'], ['poi/a.json', '{}']]);
    const png = new Uint8Array([1, 2, 3]);
    const entries = bundleEntries({ name: 'my-room', files, assets: new Map([['media/a.png', png]]), viewer: new Map([['index.html', '<html>'], ['assets/main-1.js', 'js']]) });
    expect([...entries.keys()]).toEqual(['index.html', 'assets/main-1.js', 'scenes/index.json', 'scenes/my-room/scene.json', 'scenes/my-room/poi/a.json', 'scenes/my-room/media/a.png']);
    expect(JSON.parse(entries.get('scenes/index.json'))).toEqual({ default: 'my-room', scenes: ['my-room'] });
    expect(entries.get('scenes/my-room/media/a.png')).toBe(png);
    expect(indexJson('x')).toBe('{\n  "default": "x",\n  "scenes": [\n    "x"\n  ]\n}\n');
  });
});
