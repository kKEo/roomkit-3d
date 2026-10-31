import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildScene } from '../src/config/buildScene.js';
import { SCENE_NAME } from '../src/config/loadScene.js';
import { isFeed } from '../src/data/feedSchema.js';
import { liveScreenSchema } from '../src/prefabs/screenSchema.js';
import { FEED_BLOCKS, feedBlockSchema, parseBlockData } from '../src/ui/blocks/schema.js';

/**
 * Every scene shipped in public/scenes/ must build: this is the config test suite.
 * It uses the same buildScene the browser does, reading from disk instead of over HTTP; a scene's own
 * prefab modules are imported from disk too, so their `meta()` runs here.
 */
const ROOT = join(import.meta.dirname, '..', 'public', 'scenes');

const readerFromDir = dir => async path => {
  try { return await readFile(join(dir, path), 'utf8'); } catch (e) { throw new Error(e.code === 'ENOENT' ? 'file not found' : e.message); }
};

/** Every screen config with a feed (an object with `source` and a tagged `feed`), anywhere under `node`. */
function screenFeeds(node, out = []) {
  if (node == null || typeof node !== 'object' || isFeed(node)) return out;
  if (typeof node.source === 'string' && isFeed(node.feed)) out.push(node.feed);
  for (const v of Object.values(node)) screenFeeds(v, out);
  return out;
}

/** Fenced feed blocks in a POI's Markdown: ```stats { "feed": … } ```. */
const FENCE = /```([a-z]+)\n([\s\S]*?)```/g;
const fencedFeeds = text => [...text.matchAll(FENCE)]
  .filter(([, type, body]) => FEED_BLOCKS.includes(type) && body.trim().startsWith('{'))
  .map(([, type, body]) => ({ type, ...feedBlockSchema(type).parse(JSON.parse(body)) }));

const isLocal = url => url && !/^([a-z]+:|\/)/i.test(url);

const index = JSON.parse(await readFile(join(ROOT, 'index.json'), 'utf8'));
const dirs = (await readdir(ROOT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);

describe('public/scenes/index.json', () => {
  it('lists every scene folder and names an existing default', () => {
    expect([...index.scenes].sort()).toEqual([...dirs].sort());
    expect(index.scenes).toContain(index.default);
    for (const n of index.scenes) expect(n).toMatch(SCENE_NAME);
  });
});

describe.each(dirs)('scene %s', name => {
  it('builds without config errors', async () => {
    const { scene, pois } = await buildScene({
      name,
      read: readerFromDir(join(ROOT, name)),
      resolveUrl: p => pathToFileURL(join(ROOT, name, p)).href,
      loadModule: url => import(url),
    });
    expect(scene.name).toBe(name);
    // every prefab the scene ships is placed somewhere, so the sample stays exercised
    const used = new Set([...scene.decor, ...pois.flatMap(p => p.objects)].map(o => o.type));
    for (const type of Object.keys(scene.prefabs)) expect(used.has(type), `prefab "${type}" is declared but never placed`).toBe(true);
    expect(pois.length).toBe(scene.poi.length);
    for (const p of pois) {
      expect(p.camera.position.length).toBe(3);
      expect(p.marker.position.length).toBe(3);
      expect(p.content.blocks.length).toBeGreaterThan(0);
    }
  });

  it('every live feed with a file in the scene answers with valid screen fields or block data', async () => {
    const read = readerFromDir(join(ROOT, name));
    const { scene, pois } = await buildScene({
      name, read,
      resolveUrl: p => pathToFileURL(join(ROOT, name, p)).href,
      loadModule: url => import(url),
    });
    const run = async feed => {
      const json = JSON.parse(await read(feed.url));
      const t = feed.transform ? scene.transforms[feed.transform].fn : null;
      return t ? t(json, { previous: undefined, url: feed.url, event: 'fetch' }) : json;
    };
    const allScreens = screenFeeds([scene.decor, pois.map(p => p.objects)]);
    const screens = allScreens.filter(f => isLocal(f.url));
    for (const feed of screens) {
      const r = liveScreenSchema.safeParse(await run(feed));
      expect(r.success, `${feed.url} → ${feed.transform}: ${r.error?.message}`).toBe(true);
    }
    const allBlocks = [
      ...pois.flatMap(p => p.content.blocks.filter(b => b.feed)),
      ...pois.flatMap(p => p.content.blocks.filter(b => b.type === 'markdown').flatMap(b => fencedFeeds(b.text))),
    ];
    // every transform the scene declares is used, so the sample stays exercised
    const usedTransforms = new Set([...allScreens, ...allBlocks.map(b => b.feed)].map(f => f.transform));
    for (const t of Object.keys(scene.transforms)) expect(usedTransforms.has(t), `transform "${t}" is declared but no feed uses it`).toBe(true);
    const blocks = allBlocks.filter(b => isLocal(b.feed.url));
    for (const b of blocks) {
      const r = parseBlockData(b.type, await run(b.feed));
      expect(r.ok, `${b.type} ${b.feed.url} → ${b.feed.transform}`).toBe(true);
    }
  });
});
