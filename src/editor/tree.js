import { getAt, rawAt, setAt, removeAt, insertAt, replaceRaw, pretty } from './jsonEdit.js';
import { slug } from './bundle.js';
import { BUILTIN, TYPE_NAME } from '../prefabs/registry.js';

/**
 * The scene as a tree of what an author places: the room, the scenery (`scene.json › decor`) and the stops
 * (`scene.json › poi`, in tour order) with the objects each owns. The tree is read from the files and every
 * change to it is an edit of the files (see jsonEdit.js), so the Files view and the tree never disagree.
 *
 * Keys name the nodes: `room`, `scenery`, `stops`, `stop:<poi file>`, and `<owner>:<index>` for a placed
 * object, where the owner is `decor` or a POI file. The viewer tags the objects it renders with the same keys.
 * Every object has the same shape in both places, with world coordinates, so moving one between the scenery and
 * a stop changes nothing about it: its position, props and actions travel as they are, in its own layout.
 */

const SCENE = 'scene.json';
export const DECOR = 'decor';

export const objectKey = (owner, index) => `${owner}:${index}`;
export const stopKey = file => `stop:${file}`;

/** `{ stop }`, `{ owner, index }` or `{ group }` (room, scenery, stops). */
export function parseKey(key) {
  if (key.startsWith('stop:')) return { stop: key.slice(5) };
  const i = key.lastIndexOf(':');
  return i < 0 ? { group: key } : { owner: key.slice(0, i), index: +key.slice(i + 1) };
}

/** The file and list an owner keeps its objects in. */
export const locate = owner => (owner === DECOR ? { file: SCENE, list: ['decor'] } : { file: owner, list: ['objects'] });

const tryParse = text => { try { return JSON.parse(text); } catch { return null; } };
const parsed = (files, file) => {
  const v = tryParse(files.get(file));
  if (v == null) throw new Error(`${file} is not valid JSON; fix it in Files first`);
  return v;
};
const with1 = (files, file, text) => new Map(files).set(file, text);
const listOf = v => (Array.isArray(v) ? v : []);

/** Labels for a list of objects: the name if given, else the screen id, else the type, numbered when it repeats. */
function label(nodes) {
  const total = {}, seen = {};
  for (const n of nodes) total[n.type] = (total[n.type] ?? 0) + 1;
  for (const n of nodes) {
    seen[n.type] = (seen[n.type] ?? 0) + 1;
    n.label = n.name ?? (n.screen ? `${n.type} · ${n.screen}` : total[n.type] > 1 ? `${n.type} ${seen[n.type]}` : n.type);
  }
  return nodes;
}

function objectNode(owner, index, o) {
  const name = typeof o?.name === 'string' && o.name.trim() ? o.name : null;
  const screen = o?.props?.screen && typeof o.props.screen === 'object' ? o.props.screen.id : null;
  return { key: objectKey(owner, index), owner, index, type: typeof o?.type === 'string' ? o.type : '?', name, screen: typeof screen === 'string' ? screen : null };
}

/**
 * `{ ok, title, decor: [object], stops: [{ key, file, n, id, label, markdown, camera, bad, objects }] }`. A POI file
 * that is missing or not JSON still has its stop (with `bad`), so the tree keeps its place; `ok` is false when
 * scene.json itself does not parse.
 */
export function sceneTree(files) {
  const scene = tryParse(files.get(SCENE));
  const decor = label(listOf(scene?.decor).map((o, i) => objectNode(DECOR, i, o)));
  const stops = listOf(scene?.poi).filter(f => typeof f === 'string').map((file, n) => {
    const poi = tryParse(files.get(file));
    return {
      key: stopKey(file), file, n, id: poi?.id ?? null, label: typeof poi?.label === 'string' ? poi.label : file,
      markdown: typeof poi?.content?.markdown === 'string' ? poi.content.markdown : null,
      camera: !!poi?.camera, bad: poi == null,
      objects: label(listOf(poi?.objects).map((o, i) => objectNode(file, i, o))),
    };
  });
  return { ok: scene != null, title: typeof scene?.title === 'string' ? scene.title : null, decor, stops };
}

/**
 * The build's error lines (`<scene>/<file> › <path>: message`) by the key of the node they are about: an object
 * when the path points into one, else its stop, else the room. Lines about files outside the tree are left out.
 */
export function errorsByKey(lines, name, tree) {
  const out = new Map();
  const stops = new Set(tree.stops.map(s => s.file));
  const add = (k, msg) => out.set(k, [...(out.get(k) ?? []), msg]);
  for (const line of lines) {
    const m = /^(.*?)(?: › (.*?))?: ([\s\S]*)$/.exec(line);
    if (!m) continue;
    const file = m[1].startsWith(`${name}/`) ? m[1].slice(name.length + 1) : m[1];
    const path = m[2] ?? '', msg = m[2] ? `${m[2]}: ${m[3]}` : m[3];
    if (file === SCENE) {
      const d = /^decor\.(\d+)/.exec(path);
      add(d ? objectKey(DECOR, +d[1]) : 'room', msg);
    } else if (stops.has(file)) {
      const o = /^objects\.(\d+)/.exec(path);
      add(o ? objectKey(file, +o[1]) : stopKey(file), msg);
    }
  }
  return out;
}

const count = (files, owner) => {
  const { file, list } = locate(owner);
  return listOf(getAt(files.get(file), list)).length;
};

/** The object at a key, as written in its file. */
export function objectAt(files, key) {
  const { owner, index } = parseKey(key);
  const { file, list } = locate(owner);
  return getAt(files.get(file), [...list, index]);
}

/** The object's text, dedented (the JSON view of the inspector). */
export function objectRaw(files, key) {
  const { owner, index } = parseKey(key);
  const { file, list } = locate(owner);
  return rawAt(files.get(file), [...list, index]);
}

/** Appends an object to the scenery: where every new object starts, whatever it becomes later. */
export function addToScenery(files, object) {
  const n = count(files, DECOR);
  return { files: with1(files, SCENE, insertAt(files.get(SCENE), ['decor'], -1, { value: object })), key: objectKey(DECOR, n) };
}

/**
 * Moves an object to the scenery or a stop (`owner`), before `index` (-1 appends); within its own list this
 * reorders. A stop keeps at least one object: moving its last one away is `dissolveStop`.
 */
export function moveObject(files, key, owner, index = -1) {
  const src = parseKey(key);
  const from = locate(src.owner), to = locate(owner);
  const path = [...from.list, src.index];
  const raw = rawAt(files.get(from.file), path);
  if (raw == null) throw new Error('that object is gone');
  if (src.owner !== owner && src.owner !== DECOR && count(files, src.owner) <= 1) throw new Error('a stop needs at least one object');
  let out = with1(files, from.file, removeAt(files.get(from.file), path));
  const n = count(out, owner);
  // `index` counts the list as it was: further down its own list, one item fewer is now above it
  const at = Math.min(index < 0 ? n : src.owner === owner && index > src.index ? index - 1 : index, n);
  out = with1(out, to.file, insertAt(out.get(to.file), to.list, at, { raw }));
  return { files: out, key: objectKey(owner, at) };
}

/** A fresh stop id from a label, unused by the listed stops and by the files. */
function freeId(files, label) {
  const ids = new Set(sceneTree(files).stops.map(s => s.id));
  const base = slug(label);
  let id = base, n = 2;
  while (ids.has(id) || files.has(`poi/${id}.json`) || files.has(`content/${id}.md`)) id = `${base}-${n++}`;
  return id;
}

/**
 * Turns an object into a stop of its own: a POI file holding it, a Markdown page, and the entry in scene.json
 * after the stop `after` (a POI file; the end without it). The camera and marker are left out, so the viewer
 * places them from the object, as for any POI that leaves them out.
 */
export function makeStop(files, key, label, after = null) {
  const src = parseKey(key);
  const from = locate(src.owner);
  if (src.owner !== DECOR && count(files, src.owner) <= 1) throw new Error('this object already is its stop');
  const path = [...from.list, src.index];
  const raw = rawAt(files.get(from.file), path);
  if (raw == null) throw new Error('that object is gone');
  const name = label.trim() || 'Stop';
  const id = freeId(files, name);
  const file = `poi/${id}.json`, markdown = `content/${id}.md`;
  const out = with1(files, from.file, removeAt(files.get(from.file), path));
  out.set(file, insertAt(pretty({ id, label: name, objects: [], content: { markdown } }) + '\n', ['objects'], 0, { raw }));
  out.set(markdown, `# ${name}\n\nWrite about this point of interest here.\n`);
  const list = listOf(parsed(out, SCENE).poi);
  const i = after ? list.indexOf(after) : -1;
  out.set(SCENE, insertAt(out.get(SCENE), ['poi'], i < 0 ? list.length : i + 1, { value: file }));
  return { files: out, key: stopKey(file), file, id };
}

/**
 * Names a stop nothing points at yet (one `makeStop` just made): the label, and the id, the file and the page follow
 * the new name, so a stop made from "bench 2" and named "East bench" is `east-bench`, not `bench-2`.
 */
export function renameNewStop(files, file, label) {
  const name = label.trim();
  if (!name) return { files, key: stopKey(file) };
  const poi = parsed(files, file);
  const out = with1(files, file, setAt(files.get(file), ['label'], name));
  if (slug(name) === poi.id) return { files: out, key: stopKey(file) };
  const id = freeId(out, name);
  const nfile = `poi/${id}.json`, md = poi.content?.markdown;
  const nmd = md === `content/${poi.id}.md` ? `content/${id}.md` : md;
  let text = setAt(out.get(file), ['id'], id);
  if (nmd !== md) {
    text = setAt(text, ['content', 'markdown'], nmd);
    const page = out.get(md) ?? '';
    out.set(nmd, page.startsWith(`# ${poi.label}\n`) ? `# ${name}\n${page.slice(poi.label.length + 3)}` : page);
    out.delete(md);
  }
  out.delete(file);
  out.set(nfile, text);
  const i = listOf(parsed(out, SCENE).poi).indexOf(file);
  if (i >= 0) out.set(SCENE, setAt(out.get(SCENE), ['poi', i], nfile));
  return { files: out, key: stopKey(nfile), file: nfile };
}

/** Takes a stop out of scene.json, with its file and page (unless another stop shares the page) and `camera.start` if it was this one. */
function dropStop(files, file) {
  const poi = parsed(files, file), scene = parsed(files, SCENE);
  let text = files.get(SCENE);
  const i = listOf(scene.poi).indexOf(file);
  if (i >= 0) text = removeAt(text, ['poi', i]);
  if (poi.id != null && scene.camera?.start === poi.id) text = removeAt(text, ['camera', 'start']);
  const out = with1(files, SCENE, text);
  out.delete(file);
  const md = poi.content?.markdown;
  const shared = listOf(scene.poi).some(f => f !== file && tryParse(files.get(f))?.content?.markdown === md);
  if (typeof md === 'string' && !shared) out.delete(md);
  return { out, poi };
}

/** Dissolves a stop: its objects go to the scenery (or to another stop, `owner`), the stop itself and its page go. */
export function dissolveStop(files, file, owner = DECOR) {
  const raws = listOf(parsed(files, file).objects).map((_, i) => rawAt(files.get(file), ['objects', i]));
  let { out } = dropStop(files, file);
  const to = locate(owner);
  const first = count(out, owner);
  let text = out.get(to.file);
  for (const raw of raws) text = insertAt(text, to.list, -1, { raw });
  out = with1(out, to.file, text);
  return { files: out, key: owner === DECOR ? objectKey(DECOR, first) : stopKey(owner) };
}

/** Deletes a stop with its objects and its page. */
export function deleteStop(files, file) {
  return { files: dropStop(files, file).out, key: 'stops' };
}

/** Deletes an object; a stop's last one goes with `deleteStop`. */
export function deleteObject(files, key) {
  const { owner, index } = parseKey(key);
  if (owner !== DECOR && count(files, owner) <= 1) throw new Error('a stop needs at least one object');
  const { file, list } = locate(owner);
  const n = count(files, owner);
  return { files: with1(files, file, removeAt(files.get(file), [...list, index])), key: n > 1 ? objectKey(owner, Math.min(index, n - 2)) : (owner === DECOR ? 'scenery' : stopKey(owner)) };
}

/** A copy of an object right after it, a metre to the side, in the same layout. */
export function duplicateObject(files, key) {
  const { owner, index } = parseKey(key);
  const { file, list } = locate(owner);
  const obj = objectAt(files, key);
  let text = insertAt(files.get(file), list, index + 1, { raw: objectRaw(files, key) });
  const p = Array.isArray(obj.position) ? obj.position : [0, 0, 0];
  text = setAt(text, [...list, index + 1, 'position'], [Math.round((p[0] + 1) * 100) / 100, p[1], p[2]]);
  if (obj.name) text = setAt(text, [...list, index + 1, 'name'], `${obj.name} copy`);
  return { files: with1(files, file, text), key: objectKey(owner, index + 1) };
}

/** Moves a stop to `to` in the tour order (scene.json › poi); this is also the order of the number keys. */
export function moveStop(files, file, to) {
  const list = listOf(parsed(files, SCENE).poi);
  const i = list.indexOf(file);
  if (i < 0) throw new Error(`${file} is not listed in scene.json`);
  const at = Math.max(0, Math.min(to, list.length - 1));
  if (at === i) return { files, key: stopKey(file) };
  const text = insertAt(removeAt(files.get(SCENE), ['poi', i]), ['poi'], at, { value: file });
  return { files: with1(files, SCENE, text), key: stopKey(file) };
}

/** Sets a field of an object (`path` inside it); `undefined` removes it, so a prop falls back to its default. */
export function setObjectField(files, key, path, value) {
  const { owner, index } = parseKey(key);
  const { file, list } = locate(owner);
  return with1(files, file, setAt(files.get(file), [...list, index, ...path], value));
}

/** Names an object (shown in the tree); an empty name removes it, and the automatic label comes back. */
export const renameObject = (files, key, name) => setObjectField(files, key, ['name'], name.trim() || undefined);

/** Replaces an object with the JSON text from the inspector, kept as written. */
export function setObjectRaw(files, key, raw) {
  const { owner, index } = parseKey(key);
  const { file, list } = locate(owner);
  return with1(files, file, replaceRaw(files.get(file), [...list, index], raw));
}

/** Sets a field of a file (a stop's `label`, the room's `title`, …); `undefined` removes it. */
export const setField = (files, file, path, value) => with1(files, file, setAt(files.get(file), path, value));

/**
 * What points at a stop and would lead nowhere without it: `camera.start`, `goTo` and `zoom` actions, links to
 * `#<id>` in actions and Markdown pages. Each entry is `<file> › <where>`.
 */
export function stopRefs(files, file) {
  const id = tryParse(files.get(file))?.id;
  if (typeof id !== 'string') return [];
  const scene = tryParse(files.get(SCENE)) ?? {};
  const out = [];
  if (scene.camera?.start === id) out.push(`${SCENE} › camera.start (where the room opens)`);
  const scan = (owner, objs) => listOf(objs).forEach((o, i) => {
    for (const [name, a] of Object.entries(o?.actions ?? {})) {
      if (((a?.type === 'goTo' || a?.type === 'zoom') && a.poi === id) || (a?.type === 'openUrl' && String(a.url).endsWith(`#${id}`))) {
        out.push(`${locate(owner).file} › ${locate(owner).list[0]}.${i} (${o.name ?? o.type}) › actions.${name}`);
      }
    }
  });
  scan(DECOR, scene.decor);
  for (const f of listOf(scene.poi)) {
    const poi = tryParse(files.get(f));
    scan(f, poi?.objects);
    const md = poi?.content?.markdown;
    if (f !== file && typeof md === 'string' && (files.get(md) ?? '').includes(`(#${id})`)) out.push(`${md} › a link to #${id}`);
  }
  return out;
}

// ── the scene's own types (`scene.json › prefabs`) ───────────────────────────

/** `scene.json › prefabs` as written: type → module path or URL; `{}` when absent or not a map. */
export function prefabDecls(files) {
  const v = tryParse(files.get(SCENE))?.prefabs;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** Checks a type name for a new declaration: valid, not built-in, not declared with another module. */
export function typeNameProblem(type, files, url) {
  if (!TYPE_NAME.test(type)) return 'a type name is letters, digits and "_", starting with a lowercase letter';
  if (Object.hasOwn(BUILTIN, type)) return `"${type}" is a built-in type`;
  const have = prefabDecls(files)[type];
  if (have != null && have !== url) return `"${type}" is already declared (${have})`;
  return null;
}

/** Declares types, `{ type: url }`, in scene.json, in one change; one already declared with the same module is left as is. */
export function addPrefabDecls(files, decls) {
  parsed(files, SCENE);
  let text = files.get(SCENE);
  for (const [type, url] of Object.entries(decls)) {
    const bad = typeNameProblem(type, files, url);
    if (bad) throw new Error(bad);
    if (prefabDecls(files)[type] !== url) text = setAt(text, ['prefabs', type], url);
  }
  return { files: text === files.get(SCENE) ? files : with1(files, SCENE, text), key: 'room' };
}

/** The objects of a type, as tree nodes (the scenery's first, then each stop's). */
export function typeUses(files, type) {
  const t = sceneTree(files);
  return [...t.decor, ...t.stops.flatMap(s => s.objects)].filter(n => n.type === type);
}

/** Takes a type out of `scene.json › prefabs`; refused while objects of that type stand in the scene (they are named). */
export function removePrefabDecl(files, type) {
  const used = typeUses(files, type);
  if (used.length) throw new Error(`${used.length === 1 ? 'an object uses' : `${used.length} objects use`} "${type}": ${used.map(n => n.label).join(', ')}. Delete them, or give them another type, first`);
  if (!(type in prefabDecls(files))) return { files, key: 'room' };
  let text = removeAt(files.get(SCENE), ['prefabs', type]);
  if (!Object.keys(getAt(text, ['prefabs']) ?? {}).length) text = removeAt(text, ['prefabs']);
  return { files: with1(files, SCENE, text), key: 'room' };
}

/**
 * A type name for a module URL, free in `files` and not built-in: `kiosk.js` → `kiosk`, `desk-lamp@1.2.0.min.js` →
 * `deskLamp`, `3d-plant.js` → `type3dPlant`, `door.js` → `door2` (a built-in), numbered too when the name is
 * taken by another module (`taken` adds names claimed in the same go).
 */
export function typeNameFromUrl(url, files = new Map(), taken = []) {
  let file;
  try { file = new URL(url, 'https://x/').pathname.split('/').pop() ?? ''; } catch { file = String(url).split('/').pop() ?? ''; }
  const stem = decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, '').replace(/\.min$/i, '').replace(/@.*$/, '');
  const words = stem.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  let name = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
  if (/^\d/.test(name)) name = `type${name}`;
  if (!name) name = 'type';
  const used = new Set([...Object.keys(prefabDecls(files)), ...taken]);
  const ok = n => TYPE_NAME.test(n) && !Object.hasOwn(BUILTIN, n) && !(used.has(n) && prefabDecls(files)[n] !== url);
  let out = name, i = 2;
  while (!ok(out)) out = `${name}${i++}`;
  return out;
}

const r1 = v => Math.round(v * 10) / 10;

/**
 * Where a new object goes: the spot on the floor the camera looks at (or below what it looks at), kept inside
 * the room, turned to face the camera in 15° steps. `pose` is `{ position, target }`, `room` the built scene's;
 * `taken` are the positions of the objects already placed, which the new one steps aside from (2 m at a time).
 */
export function viewSpot({ position: p, target: t }, room, taken = []) {
  const d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
  let x = t[0], z = t[2];
  if (d[1] < -1e-3) {
    const k = -p[1] / d[1];
    if (k < 1) { x = p[0] + d[0] * k; z = p[2] + d[2] * k; }
  }
  const b = room?.bounds ?? { minX: -(room?.width ?? 20) / 2, maxX: (room?.width ?? 20) / 2, minZ: -(room?.depth ?? 20) / 2, maxZ: (room?.depth ?? 20) / 2 };
  const inside = (vx, vz) => [Math.min(b.maxX - 1, Math.max(b.minX + 1, vx)), Math.min(b.maxZ - 1, Math.max(b.minZ + 1, vz))];
  const free = ([vx, vz]) => taken.every(q => Math.hypot(q[0] - vx, q[2] - vz) >= 1.5);
  const steps = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2], [4, 0], [-4, 0], [0, 4], [0, -4]];
  [x, z] = steps.map(([dx, dz]) => inside(x + dx, z + dz)).find(free) ?? inside(x, z);
  const yaw = Math.round((Math.atan2(p[0] - x, p[2] - z) * 180) / Math.PI / 15) * 15;
  return { position: [r1(x), 0, r1(z)], rotation: [0, Object.is(yaw, -0) || yaw === -180 ? Math.abs(yaw) : yaw, 0] };
}
