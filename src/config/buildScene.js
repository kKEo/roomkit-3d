import { SCENE_DEFAULTS, deepMerge } from './defaults.js';
import { makeSchemas, parseOrThrow, ConfigError } from './schema.js';
import { BUILTIN, BUILTIN_REGISTRY, TYPE_NAME, createRegistry, normalisePrefab } from '../prefabs/registry.js';
import { META_SDK } from '../prefabs/metaSdk.js';
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
 * - `loadModule(url)`  imports an ES module by URL (a scene's own prefab, `scene.json › prefabs`);
 *                      optional: without it a scene that declares prefabs fails with a config error.
 *
 * The result's `scene` also carries `registry` (the prefab types this scene can use, built-ins plus
 * its own; see src/prefabs/registry.js) and `prefabs` (its own types, type → resolved module URL).
 *
 * Every config mistake becomes a line of one ConfigError; nothing is thrown half-way.
 */
export async function buildScene({ name, read, resolveUrl, loadModule }) {
  const label = f => `${name}/${f}`;
  const raw = parseJson(await readLabelled(read, 'scene.json', label('scene.json')), label('scene.json'));

  // the scene's own prefabs first: their schemas validate the objects below
  const { extra, errors } = await loadPrefabs(raw?.prefabs, { resolveUrl, loadModule, label: label('scene.json') });
  const registry = createRegistry(extra);
  const { sceneSchema, poiSchema } = makeSchemas(registry);

  let scene;
  try { scene = parseOrThrow(sceneSchema, deepMerge(SCENE_DEFAULTS, raw), label('scene.json')); } catch (e) {
    if (e instanceof ConfigError) throw new ConfigError([...errors, ...e.lines.filter(l => !l.includes(' › prefabs.'))]);
    throw e;
  }
  scene.name = name;
  scene.registry = registry;
  scene.prefabs = Object.fromEntries(Object.entries(extra).map(([t, e]) => [t, e.url]));
  scene.room = withFootprint(scene.room);
  scene.camera.overview ??= overviewCamera(scene.room);
  scene.decor = scene.decor.map(o => resolveObjectMedia(o, resolveUrl, registry));

  // all POIs in parallel, so one broken file does not hide problems in the others
  const results = await Promise.allSettled(scene.poi.map(f => buildPoi(f, { read, resolveUrl, label, poiSchema, registry })));
  errors.push(...results.flatMap((r, i) =>
    r.status === 'rejected' ? (r.reason instanceof ConfigError ? r.reason.lines : [`${label(scene.poi[i])}: ${r.reason?.message ?? r.reason}`]) : []));
  const pois = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const seen = new Set();
  for (const p of pois) {
    if (seen.has(p.id)) errors.push(`${label(p.file)} › id: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  if (errors.length) throw new ConfigError(errors);
  return { scene, pois };
}

/**
 * Loads the modules named in `scene.json › prefabs` and turns each into a registry entry
 * (its normalised meta plus `url` and `module`). Every problem is a line
 * `<scene>/scene.json › prefabs.<type>: <reason>`; the other entries still load.
 */
async function loadPrefabs(decl, { resolveUrl, loadModule, label }) {
  const extra = {}, errors = [];
  if (decl == null) return { extra, errors };
  const line = (type, msg) => `${label} › prefabs${type == null ? '' : '.' + type}: ${msg}`;
  if (typeof decl !== 'object' || Array.isArray(decl)) { errors.push(line(null, 'must be a map of type name → module path or URL')); return { extra, errors }; }
  // checked by hand rather than with prefabsDeclSchema: zod reports a bad record key only as "Invalid key in record"
  const entries = Object.entries(decl).filter(([type, path]) => {
    if (!TYPE_NAME.test(type)) errors.push(line(type, 'a type name is letters, digits and "_", starting with a lowercase letter'));
    else if (typeof path !== 'string' || !path) errors.push(line(type, 'give the path or URL of the prefab module'));
    else return true;
    return false;
  });

  const results = await Promise.allSettled(entries.map(async ([type, path]) => {
    if (Object.hasOwn(BUILTIN, type)) throw new Error(`"${type}" is a built-in type`);
    if (!loadModule) throw new Error('this build cannot load scene prefabs');
    const url = isRelative(path) ? resolveUrl(path) : path;
    let mod;
    try { mod = await loadModule(url); } catch (e) { throw new Error(`could not load ${url}: ${e?.message ?? e}`); }
    if (typeof mod?.meta !== 'function') throw new Error(`${url}: module has no "meta" export`);
    let meta;
    try { meta = mod.meta(META_SDK); } catch (e) { throw new Error(`meta() failed: ${e?.message ?? e}`); }
    return { ...normalisePrefab(type, meta), url, module: mod };
  }));
  results.forEach((res, i) => {
    const type = entries[i][0];
    if (res.status === 'fulfilled') extra[type] = res.value;
    else errors.push(line(type, res.reason?.message ?? res.reason));
  });
  return { extra, errors };
}

async function buildPoi(file, { read, resolveUrl, label, poiSchema, registry }) {
  const l = label(file);
  const poi = parseOrThrow(poiSchema, parseJson(await readLabelled(read, file, l), l), l);
  poi.file = file;
  poi.objects = poi.objects.map(o => resolveObjectMedia(o, resolveUrl, registry));

  if (!poi.camera || !poi.marker) {
    const first = poi.objects[0];
    const auto = autoPlacement(first, registry.get(first.type).placement(first.props));
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
export function resolveObjectMedia(obj, resolveUrl, registry = BUILTIN_REGISTRY) {
  const props = registry.get(obj.type).media.reduce((p, key) => resolveAt(p, key.split('.'), resolveUrl), obj.props);
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
