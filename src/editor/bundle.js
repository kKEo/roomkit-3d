import { BUILTIN_REGISTRY } from '../prefabs/registry.js';

/**
 * Scene bundles for the editor: a `Map<path, text>` of a scene folder's text files
 * (`scene.json`, `poi/*.json`, `content/*.md`), the shape `buildScene` reads through `readerFromMap`.
 * Media files stay where they are and are referenced by path.
 */

const json = o => JSON.stringify(o, null, 2) + '\n';

/** Text of a file by URL, or an Error saying why (the dev server answers missing files with HTML). */
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) throw new Error(`${url}: file not found${res.ok ? '' : ` (HTTP ${res.status})`}`);
  return res.text();
}

/** Fetch a published scene folder's text files. `base` is the folder URL (with a trailing slash). */
export async function fetchBundle(base) {
  const files = new Map();
  const sceneText = await fetchText(new URL('scene.json', base));
  files.set('scene.json', sceneText);
  let scene;
  try { scene = JSON.parse(sceneText); } catch { return files; } // the editor will show the JSON error
  for (const file of Array.isArray(scene.poi) ? scene.poi : []) {
    try {
      const text = await fetchText(new URL(file, base));
      files.set(file, text);
      const md = JSON.parse(text)?.content?.markdown;
      if (typeof md === 'string') files.set(md, await fetchText(new URL(md, base)));
    } catch { /* a missing file is reported by buildScene as a config error */ }
  }
  return files;
}

/** A url-safe id from a label: "North wall" → "north-wall". */
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

/**
 * A placed object with every prop of the prefab spelled out at its default, so the author sees the knobs.
 * `registry` is the scene's (built-ins plus its own prefabs, `scene.registry`); the built-ins by default.
 */
export function objectTemplate(type, registry = BUILTIN_REGISTRY) {
  return { type, position: [0, 0, 0], rotation: [0, 0, 0], props: registry.get(type).props };
}

/** A new POI file and its Markdown page. */
export function poiTemplate(id, label, type, registry) {
  return {
    poi: { id, label, objects: [objectTemplate(type, registry)], content: { markdown: `content/${id}.md` } },
    markdown: `# ${label}\n\nWrite about this point of interest here.\n`,
  };
}

/** The smallest useful scene: a room and one POI. */
export function newSceneFiles(title = 'My Room') {
  const id = 'start';
  const { poi, markdown } = poiTemplate(id, 'Start', 'pedestal');
  return new Map([
    ['scene.json', json({ title, brand: title.replace(/\s+/, '/'), room: { width: 20, height: 7, depth: 20, lights: [[0, 6.6, 0]] }, poi: [`poi/${id}.json`] })],
    [`poi/${id}.json`, json(poi)],
    [`content/${id}.md`, markdown],
  ]);
}

/** A copy of `files` with a new POI added and listed in scene.json. Throws if scene.json is not valid JSON. */
export function addPoi(files, label, type = 'pedestal', registry) {
  const scene = JSON.parse(files.get('scene.json'));
  let id = slug(label), n = 2;
  while (files.has(`poi/${id}.json`)) id = `${slug(label)}-${n++}`;
  const { poi, markdown } = poiTemplate(id, label, type, registry);
  const out = new Map(files);
  out.set(`poi/${id}.json`, json(poi));
  out.set(`content/${id}.md`, markdown);
  scene.poi = [...(scene.poi ?? []), `poi/${id}.json`];
  out.set('scene.json', json(scene));
  return { files: out, file: `poi/${id}.json` };
}

/** A copy of `files` with an object of `type` appended to the POI file (or to `decor` for scene.json). */
export function addObject(files, file, type, registry) {
  const doc = JSON.parse(files.get(file));
  const list = file === 'scene.json' ? (doc.decor ??= []) : (doc.objects ??= []);
  list.push(objectTemplate(type, registry));
  return new Map(files).set(file, json(doc));
}
