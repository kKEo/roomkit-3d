import { SCENE_DEFAULTS, deepMerge } from './defaults.js';
import { sceneSchema, poiSchema, parseOrThrow, ConfigError } from './schema.js';
import { PREFABS } from '../prefabs/registry.js';
import { autoPlacement, overviewCamera } from '../lib/autoCamera.js';
import { withFootprint } from '../lib/footprint.js';

/**
 * Builds the `{ scene, pois }` the app renders from a scene folder's files. Pure: it knows nothing
 * about fetch or the page URL, so the same code serves the browser, an editor holding files in
 * memory, and tests reading from disk.
 *
 * - `read(path)`       resolves to the text of a file, `path` relative to the scene folder
 *                      (`scene.json`, `poi/x.json`, `content/x.md`); rejects with an Error whose
 *                      message says why (`file not found`, …). buildScene adds the file label.
 * - `resolveUrl(path)` turns a relative media path into the URL the renderer loads.
 *
 * Every config mistake becomes a line of one ConfigError; nothing is thrown half-way.
 */
export async function buildScene({ name, read, resolveUrl }) {
  const label = f => `${name}/${f}`;
  const raw = parseJson(await readLabelled(read, 'scene.json', label('scene.json')), label('scene.json'));
  const scene = parseOrThrow(sceneSchema, deepMerge(SCENE_DEFAULTS, raw), label('scene.json'));
  scene.name = name;
  scene.room = withFootprint(scene.room);
  scene.camera.overview ??= overviewCamera(scene.room);
  scene.decor = scene.decor.map(o => resolveObjectMedia(o, resolveUrl));

  // all POIs in parallel, so one broken file does not hide problems in the others
  const results = await Promise.allSettled(scene.poi.map(f => buildPoi(f, { read, resolveUrl, label })));
  const errors = results.flatMap((r, i) =>
    r.status === 'rejected' ? (r.reason instanceof ConfigError ? r.reason.lines : [`${label(scene.poi[i])}: ${r.reason?.message ?? r.reason}`]) : []);
  const pois = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const seen = new Set();
  for (const p of pois) {
    if (seen.has(p.id)) errors.push(`${label(p.file)} › id: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  if (errors.length) throw new ConfigError(errors);
  return { scene, pois };
}

async function buildPoi(file, { read, resolveUrl, label }) {
  const l = label(file);
  const poi = parseOrThrow(poiSchema, parseJson(await readLabelled(read, file, l), l), l);
  poi.file = file;
  poi.objects = poi.objects.map(o => resolveObjectMedia(o, resolveUrl));

  if (!poi.camera || !poi.marker) {
    const first = poi.objects[0];
    const auto = autoPlacement(first, PREFABS[first.type].placement(first.props));
    poi.camera ??= auto.camera;
    poi.marker ??= auto.marker;
  }

  if ('markdown' in poi.content) {
    const text = await readLabelled(read, poi.content.markdown, `${l} › content.markdown`);
    poi.content = { blocks: [{ type: 'markdown', text }] };
  }
  return poi;
}

async function readLabelled(read, path, label) {
  try { return await read(path); } catch (e) { throw e instanceof ConfigError ? e : new ConfigError([`${label}: ${e?.message ?? e}`]); }
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch (e) { throw new ConfigError([`${label}: invalid JSON — ${e.message}`]); }
}

/** Relative paths are resolved against the scene folder; `https:`, `data:`, `/abs` and friends are left alone. */
export const isRelative = v => typeof v === 'string' && !/^([a-z]+:|\/)/i.test(v);

/** Resolve every media prop listed in the prefab's `media` (`"src"`, `"screen.src"`, `"screens[].src"`). */
export function resolveObjectMedia(obj, resolveUrl) {
  const props = PREFABS[obj.type].media.reduce((p, key) => resolveAt(p, key.split('.'), resolveUrl), obj.props);
  return props === obj.props ? obj : { ...obj, props };
}

function resolveAt(node, segs, resolveUrl) {
  if (node == null || typeof node !== 'object') return node;
  const [head, ...rest] = segs;
  const list = head.endsWith('[]');
  const key = list ? head.slice(0, -2) : head;
  const v = node[key];
  if (v == null) return node;
  let nv;
  if (list) {
    if (!Array.isArray(v)) return node;
    nv = v.map(it => (rest.length ? resolveAt(it, rest, resolveUrl) : isRelative(it) ? resolveUrl(it) : it));
    if (nv.every((x, i) => x === v[i])) return node;
  } else if (rest.length) nv = resolveAt(v, rest, resolveUrl);
  else nv = isRelative(v) ? resolveUrl(v) : v;
  return nv === v ? node : { ...node, [key]: nv };
}

/** A `read` over an in-memory `Map<path, text>` (editor state, tests). */
export const readerFromMap = files => async path => {
  if (!files.has(path)) throw new Error('file not found');
  return files.get(path);
};
