import { SCENE_DEFAULTS, deepMerge } from './defaults.js';
import { sceneSchema, poiSchema, parseOrThrow, ConfigError } from './schema.js';
import { PREFABS } from '../prefabs/registry.js';
import { autoPlacement } from '../lib/autoCamera.js';

const SCENES_BASE = new URL(`${import.meta.env.BASE_URL}scenes/`, location.href);

async function fetchFile(url, label, kind) {
  let res;
  try { res = await fetch(url); } catch (e) { throw new ConfigError([`${label}: ${e.message}`]); }
  // The dev server answers unknown paths with index.html, so treat HTML as "missing" too.
  if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) {
    throw new ConfigError([`${label}: file not found${res.ok ? '' : ` (HTTP ${res.status})`}`]);
  }
  const text = await res.text();
  if (kind !== 'json') return text;
  try { return JSON.parse(text); } catch (e) { throw new ConfigError([`${label}: invalid JSON — ${e.message}`]); }
}

const isRelative = v => typeof v === 'string' && !/^([a-z]+:|\/)/i.test(v);

function normalizeObject(obj, base) {
  const prefab = PREFABS[obj.type];
  const props = { ...prefab.props, ...obj.props };
  for (const key of prefab.media || []) if (isRelative(props[key])) props[key] = new URL(props[key], base).href;
  return { ...obj, props };
}

async function loadPoi(file, base, sceneName) {
  const label = `${sceneName}/${file}`;
  const poi = parseOrThrow(poiSchema, await fetchFile(new URL(file, base), label, 'json'), label);
  poi.file = file;
  poi.objects = poi.objects.map(o => normalizeObject(o, base));

  if (!poi.camera || !poi.marker) {
    const first = poi.objects[0];
    const auto = autoPlacement(first, PREFABS[first.type].placement(first.props));
    poi.camera ??= auto.camera;
    poi.marker ??= auto.marker;
  }

  if ('markdown' in poi.content) {
    poi.content = { blocks: [{ type: 'markdown', text: await fetchFile(new URL(poi.content.markdown, base), `${label} › content.markdown`) }] };
  }
  return poi;
}

export function sceneNameFromUrl() {
  return new URLSearchParams(location.search).get('scene');
}

/** Loads scene.json, every POI file and its Markdown; collects all config errors before failing. */
export async function loadScene() {
  let name = sceneNameFromUrl();
  if (!name) name = (await fetchFile(new URL('index.json', SCENES_BASE), 'scenes/index.json', 'json')).default;
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name || '')) throw new ConfigError([`invalid scene name "${name}"`]);

  const base = new URL(`${name}/`, SCENES_BASE);
  const raw = await fetchFile(new URL('scene.json', base), `${name}/scene.json`, 'json');
  const scene = parseOrThrow(sceneSchema, deepMerge(SCENE_DEFAULTS, raw), `${name}/scene.json`);
  scene.name = name;
  scene.decor = scene.decor.map(o => normalizeObject(o, base));

  const results = await Promise.allSettled(scene.poi.map(f => loadPoi(f, base, name)));
  const errors = results.flatMap(r => (r.status === 'rejected' ? r.reason.lines || [String(r.reason.message)] : []));
  const pois = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const seen = new Set();
  for (const p of pois) {
    if (seen.has(p.id)) errors.push(`${name}/${p.file} › id: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  if (errors.length) throw new ConfigError(errors);
  return { scene, pois };
}
