import { isRelative } from '../config/buildScene.js';
import { FEED_BLOCKS } from '../ui/blocks/schema.js';
import { BUILTIN_REGISTRY } from '../prefabs/registry.js';

/**
 * "Export site": a standalone site from the editor's files, pure and DOM-free.
 *
 * - the two publishing options live in scene.json (`camera.freeFly`, `camera.start`): read and written here
 * - `sceneRefs` lists every file the scene refers to by a relative path and that is not among the text files:
 *   prefab and transform modules, media props (each prefab's `media` list), feed URLs of screens, panel blocks
 *   and fenced feed blocks in Markdown. Files a prefab loads itself (`assetUrl`) and media a feed answers with
 *   cannot be found here.
 * - `bundleEntries` lays out the zip: the viewer's files, `scenes/index.json` naming the one scene, the folder.
 */

const json = o => JSON.stringify(o, null, 2) + '\n';
const parse = text => { try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const FENCE = /```([a-z]+)\n([\s\S]*?)```/g;
const clean = p => p.replace(/^(\.\/)+/, '');

/** The publishing options held in scene.json: `{ freeFly, start }`, `start` a POI id, a pose or null. */
export function exportOptions(files) {
  const camera = parse(files.get('scene.json') ?? '')?.camera ?? {};
  return { freeFly: camera.freeFly !== false, start: camera.start ?? null };
}

/** The files with `camera.freeFly` / `camera.start` set in scene.json; the defaults (`true`, `null`) are left out. */
export function withExportOptions(files, { freeFly, start }) {
  const scene = parse(files.get('scene.json') ?? '');
  if (!scene) return files;
  const camera = { ...(scene.camera && typeof scene.camera === 'object' ? scene.camera : {}) };
  if (freeFly === false) camera.freeFly = false; else delete camera.freeFly;
  if (start != null) camera.start = start; else delete camera.start;
  const next = { ...scene, camera };
  if (!Object.keys(camera).length) delete next.camera;
  return new Map(files).set('scene.json', json(next));
}

/** Collect the strings at a prop path such as `screen.src` or `screens[].src` (as buildScene resolves them). */
function mediaAt(node, segs, out) {
  if (node == null || typeof node !== 'object') return;
  const [head, ...rest] = segs;
  const list = head.endsWith('[]'), key = list ? head.slice(0, -2) : head;
  const v = node[key];
  if (v == null) return;
  const leaf = x => { if (typeof x === 'string') out.push(x); };
  if (list) { if (Array.isArray(v)) for (const it of v) rest.length ? mediaAt(it, rest, out) : leaf(it); }
  else if (rest.length) mediaAt(v, rest, out);
  else leaf(v);
}

function feedUrls(feed, out) {
  if (typeof feed === 'string') out.push(feed);
  else if (feed && typeof feed === 'object') {
    if (typeof feed.url === 'string') out.push(feed.url);
    if (typeof feed.stream === 'string') out.push(feed.stream);
  }
}

/** Every screen config with a feed anywhere under `node` (raw JSON: an object with a string `source` and a `feed`). */
function screenFeeds(node, out) {
  if (node == null || typeof node !== 'object') return;
  if (typeof node.source === 'string' && node.feed != null) feedUrls(node.feed, out);
  for (const v of Object.values(node)) screenFeeds(v, out);
}

function objectRefs(objects, registry, out) {
  for (const o of Array.isArray(objects) ? objects : []) {
    if (!o || typeof o !== 'object') continue;
    const keys = registry.has(o.type) ? registry.get(o.type).media : [];
    for (const k of keys) mediaAt(o.props, k.split('.'), out);
    screenFeeds(o.props, out);
  }
}

/** Relative paths the scene refers to and that are not in `files`, sorted and unique (see the header). */
export function sceneRefs(files, registry = BUILTIN_REGISTRY) {
  const out = [];
  const scene = parse(files.get('scene.json') ?? '');
  if (scene) {
    for (const p of Object.values(scene.prefabs ?? {})) if (typeof p === 'string') out.push(p);
    for (const p of Object.values(scene.transforms ?? {})) if (typeof p === 'string') out.push(p.split('#')[0]);
    objectRefs(scene.decor, registry, out);
  }
  for (const [path, text] of files) {
    if (path.endsWith('.json') && path !== 'scene.json') {
      const poi = parse(text);
      if (!poi) continue;
      objectRefs(poi.objects, registry, out);
      for (const b of Array.isArray(poi.content?.blocks) ? poi.content.blocks : []) if (b && typeof b === 'object') feedUrls(b.feed, out);
    } else if (path.endsWith('.md')) {
      for (const [, type, body] of text.matchAll(FENCE)) {
        if (!FEED_BLOCKS.includes(type)) continue;
        const data = parse(body.trim());
        if (data && 'feed' in data) feedUrls(data.feed, out);
      }
    }
  }
  return [...new Set(out.filter(isRelative).map(clean))].filter(p => p && !files.has(p)).sort();
}

/** `scenes/index.json` for a one-scene site. */
export const indexJson = name => json({ default: name, scenes: [name] });

/**
 * The zip's entries: `viewer` (path → bytes) at the root, `scenes/index.json`, then the scene's text `files`
 * and fetched `assets` (relative path → bytes) under `scenes/<name>/`.
 */
export function bundleEntries({ name, files, assets = new Map(), viewer = new Map() }) {
  const out = new Map(viewer);
  out.set('scenes/index.json', indexJson(name));
  for (const [p, t] of files) out.set(`scenes/${name}/${p}`, t);
  for (const [p, b] of assets) out.set(`scenes/${name}/${p}`, b);
  return out;
}
