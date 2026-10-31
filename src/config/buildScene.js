import { SCENE_DEFAULTS, deepMerge } from './defaults.js';
import { makeSchemas, parseOrThrow, ConfigError } from './schema.js';
import { BUILTIN, BUILTIN_REGISTRY, TYPE_NAME, createRegistry, normalisePrefab } from '../prefabs/registry.js';
import { META_SDK } from '../prefabs/metaSdk.js';
import { isFeed } from '../data/feedSchema.js';
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
 * - `loadModule(url)`  imports an ES module by URL (a scene's own prefab, `scene.json › prefabs`, or
 *                      transform, `scene.json › transforms`); optional: without it a scene that
 *                      declares either fails with a config error.
 *
 * The result's `scene` also carries `registry` (the prefab types this scene can use, built-ins plus
 * its own; see src/prefabs/registry.js), `prefabs` (its own types, type → resolved module URL),
 * `transforms` (name → `{ url, fn }`, for live feeds; see src/data/feedSchema.js) and `resolveUrl`,
 * which feeds use to resolve their relative URLs when they start.
 *
 * Every config mistake becomes a line of one ConfigError; nothing is thrown half-way.
 */
export async function buildScene({ name, read, resolveUrl, loadModule }) {
  const label = f => `${name}/${f}`;
  const raw = parseJson(await readLabelled(read, 'scene.json', label('scene.json')), label('scene.json'));

  // the scene's own modules first: prefab schemas validate the objects below, transforms are checked against feeds
  const opts = { resolveUrl, loadModule, label: label('scene.json') };
  const [prefabs, transforms] = await Promise.all([loadPrefabs(raw?.prefabs, opts), loadTransforms(raw?.transforms, opts)]);
  const errors = [...prefabs.errors, ...transforms.errors];
  const registry = createRegistry(prefabs.extra);
  const { sceneSchema, poiSchema } = makeSchemas(registry);

  let scene;
  try { scene = parseOrThrow(sceneSchema, deepMerge(SCENE_DEFAULTS, raw), label('scene.json')); } catch (e) {
    if (e instanceof ConfigError) throw new ConfigError([...errors, ...e.lines.filter(l => !l.includes(' › prefabs.') && !l.includes(' › transforms.'))]);
    throw e;
  }
  scene.name = name;
  scene.registry = registry;
  scene.prefabs = Object.fromEntries(Object.entries(prefabs.extra).map(([t, e]) => [t, e.url]));
  scene.transforms = transforms.extra;
  scene.resolveUrl = resolveUrl;
  scene.room = withFootprint(scene.room);
  scene.camera.overview ??= overviewCamera(scene.room);
  scene.decor = scene.decor.map(o => resolveObjectMedia(o, resolveUrl, registry));
  checkFeeds(scene.decor, 'decor', transforms.extra, label('scene.json'), errors);

  // all POIs in parallel, so one broken file does not hide problems in the others
  const results = await Promise.allSettled(scene.poi.map(f => buildPoi(f, { read, resolveUrl, label, poiSchema, registry, transforms: transforms.extra })));
  errors.push(...results.flatMap((r, i) =>
    r.status === 'rejected' ? (r.reason instanceof ConfigError ? r.reason.lines : [`${label(scene.poi[i])}: ${r.reason?.message ?? r.reason}`]) : []));
  const pois = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const seen = new Set();
  for (const p of pois) {
    if (seen.has(p.id)) errors.push(`${label(p.file)} › id: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  if (scene.camera.start != null && !seen.has(scene.camera.start)) errors.push(`${label('scene.json')} › camera.start: no POI has the id "${scene.camera.start}"`);
  if (errors.length) throw new ConfigError(errors);
  return { scene, pois };
}

/**
 * Loads every module named in a `scene.json` map (`prefabs` or `transforms`) with `load(name, path)`.
 * Every problem is a line `<scene>/scene.json › <key>.<name>: <reason>`; the other entries still load.
 * Names and paths are checked by hand rather than with zod, which reports a bad record key only as
 * "Invalid key in record".
 */
async function loadDeclared(decl, { key, what, label, load }) {
  const extra = Object.create(null), errors = []; // no prototype: a name like "constructor" can only be a declared one
  if (decl == null) return { extra, errors };
  const line = (name, msg) => `${label} › ${key}${name == null ? '' : '.' + name}: ${msg}`;
  if (typeof decl !== 'object' || Array.isArray(decl)) { errors.push(line(null, `must be a map of ${what} name → module path or URL`)); return { extra, errors }; }
  const entries = Object.entries(decl).filter(([name, path]) => {
    if (!TYPE_NAME.test(name)) errors.push(line(name, `a ${what} name is letters, digits and "_", starting with a lowercase letter`));
    else if (typeof path !== 'string' || !path) errors.push(line(name, `give the path or URL of the ${what} module`));
    else return true;
    return false;
  });
  const results = await Promise.allSettled(entries.map(([name, path]) => load(name, path)));
  results.forEach((res, i) => {
    const name = entries[i][0];
    if (res.status === 'fulfilled') extra[name] = res.value;
    else errors.push(line(name, res.reason?.message ?? res.reason));
  });
  return { extra, errors };
}

/** Imports a declared module, turning a failure into a reason that names the URL. */
async function importDeclared(path, { resolveUrl, loadModule, kind }) {
  if (!loadModule) throw new Error(`this build cannot load scene ${kind}`);
  const url = isRelative(path) ? resolveUrl(path) : path;
  try { return { url, mod: await loadModule(url) }; } catch (e) { throw new Error(`could not load ${url}: ${e?.message ?? e}`); }
}

/** `scene.json › prefabs`: each module becomes a registry entry (its normalised meta plus `url` and `module`). */
function loadPrefabs(decl, { resolveUrl, loadModule, label }) {
  return loadDeclared(decl, {
    key: 'prefabs', what: 'type', label,
    load: async (type, path) => {
      if (Object.hasOwn(BUILTIN, type)) throw new Error(`"${type}" is a built-in type`);
      const { url, mod } = await importDeclared(path, { resolveUrl, loadModule, kind: 'prefabs' });
      if (typeof mod?.meta !== 'function') throw new Error(`${url}: module has no "meta" export`);
      let meta;
      try { meta = mod.meta(META_SDK); } catch (e) { throw new Error(`meta() failed: ${e?.message ?? e}`); }
      return { ...normalisePrefab(type, meta), url, module: mod };
    },
  });
}

/**
 * `scene.json › transforms`: `"name": "data/feeds.js#nodes"` is the module's `nodes` export, a bare path
 * its `transform` export. Each becomes `{ url, fn }`; `url` (with the `#export`) identifies it in the feed hub.
 * Several names may point into one module; the browser imports it once.
 */
function loadTransforms(decl, { resolveUrl, loadModule, label }) {
  return loadDeclared(decl, {
    key: 'transforms', what: 'transform', label,
    load: async (_, ref) => {
      const hash = ref.lastIndexOf('#');
      const path = hash < 0 ? ref : ref.slice(0, hash);
      const exp = hash < 0 ? 'transform' : ref.slice(hash + 1);
      if (!path || !exp) throw new Error('write "path/to/module.js" or "path/to/module.js#exportName"');
      const { url, mod } = await importDeclared(path, { resolveUrl, loadModule, kind: 'transforms' });
      if (typeof mod?.[exp] !== 'function') throw new Error(`${url}: module has no "${exp}" function export`);
      return { url: `${url}#${exp}`, fn: mod[exp] };
    },
  });
}

/**
 * Reports every feed (anywhere in `node`) whose `transform` the scene does not declare, as
 * `<file> › <path>.feed.transform: …`. Feeds are found by their FEED tag, so a scene prefab's own props count too.
 */
export function checkFeeds(node, path, transforms, file, errors) {
  if (node == null || typeof node !== 'object') return;
  if (isFeed(node)) {
    if (node.transform && !Object.hasOwn(transforms, node.transform)) {
      const known = Object.keys(transforms);
      errors.push(`${file} › ${path}.transform: unknown transform "${node.transform}" (${known.length ? `known: ${known.join(', ')}` : 'none declared in scene.json › transforms'})`);
    }
    return;
  }
  if (Array.isArray(node)) node.forEach((v, i) => checkFeeds(v, `${path}.${i}`, transforms, file, errors));
  else for (const [k, v] of Object.entries(node)) checkFeeds(v, path ? `${path}.${k}` : k, transforms, file, errors);
}

async function buildPoi(file, { read, resolveUrl, label, poiSchema, registry, transforms = {} }) {
  const l = label(file);
  const poi = parseOrThrow(poiSchema, parseJson(await readLabelled(read, file, l), l), l);
  poi.file = file;
  poi.objects = poi.objects.map(o => resolveObjectMedia(o, resolveUrl, registry));
  const feedErrors = [];
  checkFeeds(poi.objects, 'objects', transforms, l, feedErrors);
  if ('blocks' in poi.content) checkFeeds(poi.content.blocks, 'content.blocks', transforms, l, feedErrors);
  if (feedErrors.length) throw new ConfigError(feedErrors);

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
