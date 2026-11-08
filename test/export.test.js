import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildScene } from '../src/config/buildScene.js';
import { exportOptions, withExportOptions, sceneRefs, hostedModules, bundleEntries, folderEntries, indexJson, importZip, mimeOf, cleanPath } from '../src/editor/export.js';
import { makeZip } from '../src/editor/zip.js';
import { readZip } from '../src/editor/unzip.js';

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
      ['scene.json', json({ prefabs: { lamp: 'prefabs/lamp.js', kiosk: 'https://cdn.example/kiosk.js' }, transforms: { t: 'https://cdn.example/t.js#t' }, decor: [{ type: 'pictureFrame', props: { image: 'https://img.example/a.png' } }, { type: 'nope', props: { src: 'media/x.svg' } }], poi: ['poi/a.json'] })],
      ['poi/a.json', json({ id: 'a', objects: [{ type: 'desk', props: { screen: { source: 'stats', feed: { url: './data/kpi.json', stream: '/abs/sse' } } } }], content: { markdown: 'content/a.md', blocks: [{ type: 'list', feed: 'data/list.json' }] } })],
      ['content/a.md', '# A\n\n```stats\n{ "feed": "data/kpi.json" }\n```\n\n```js\nnot a feed\n```\n'],
      ['data/list.json', '[]'],
    ]);
    expect(sceneRefs(files)).toEqual(['data/kpi.json', 'prefabs/lamp.js']);
    expect(hostedModules(files)).toEqual(['https://cdn.example/kiosk.js', 'https://cdn.example/t.js']);
    expect(hostedModules(new Map([['scene.json', '{']]))).toEqual([]);
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

  it('folderEntries puts the same files under <name>/ with no viewer and no index', () => {
    const entries = folderEntries({ name: 'r', files: new Map([['scene.json', '{}']]), assets: new Map([['media/a.png', new Uint8Array(1)]]) });
    expect([...entries.keys()]).toEqual(['r/scene.json', 'r/media/a.png']);
  });

  it('mimeOf and cleanPath', () => {
    expect(mimeOf('prefabs/lamp.js')).toBe('text/javascript');
    expect(mimeOf('media/clip.MP4')).toBe('video/mp4');
    expect(mimeOf('odd.xyz')).toBe('application/octet-stream');
    expect(cleanPath('./media/a.png')).toBe('media/a.png');
  });
});

describe('importZip', () => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const files = new Map([
    ['scene.json', json({ title: 'T', poi: ['poi/a.json'] })],
    ['poi/a.json', json({ id: 'a', content: { markdown: 'content/a.md' } })],
    ['content/a.md', '# A\n'],
  ]);
  const png = new Uint8Array([9, 8, 7]);
  const texts = m => Object.fromEntries([...m].map(([k, v]) => [k, typeof v === 'string' ? v : dec.decode(v)]));

  it('takes the scene a site zip names in scenes/index.json, splitting text files from assets', async () => {
    const site = bundleEntries({ name: 'room', files, assets: new Map([['media/a.png', png], ['prefabs/lamp.js', enc.encode('export const meta = 1;')]]), viewer: new Map([['index.html', '<html>'], ['assets/main.js', 'js']]) });
    const r = importZip(await readZip(makeZip(site)));
    expect(r.name).toBe('room');
    expect(texts(r.files)).toEqual(texts(files));
    expect([...r.assets.keys()]).toEqual(['media/a.png', 'prefabs/lamp.js']);
    expect(r.assets.get('media/a.png')).toEqual(png);
  });

  it('takes a folder zip (Download .zip) and a bare folder, ignoring Finder junk', async () => {
    const folder = importZip(await readZip(makeZip(new Map([...folderEntries({ name: 'my-room', files }), ['__MACOSX/my-room/._scene.json', 'x'], ['my-room/.DS_Store', 'x']]))));
    expect(folder.name).toBe('my-room');
    expect(texts(folder.files)).toEqual(texts(files));
    expect(folder.assets.size).toBe(0);
    const bare = importZip(await readZip(makeZip(files)));
    expect(bare.name).toBe(null);
    expect(texts(bare.files)).toEqual(texts(files));
  });

  it('prefers the scene.json nearest the root, and gives null without one', () => {
    const entries = new Map([['deep/er/scene.json', enc.encode('{}')], ['top/scene.json', enc.encode('{ "poi": [] }')], ['top/media/x.svg', enc.encode('<svg/>')]]);
    const r = importZip(entries);
    expect(r.name).toBe('top');
    expect([...r.assets.keys()]).toEqual(['media/x.svg']);
    expect(importZip(new Map([['readme.txt', enc.encode('hi')]]))).toBe(null);
  });
});
