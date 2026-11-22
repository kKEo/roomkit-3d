import { z } from 'zod';
import { resolvePlacement } from '../config/placement.js';
import { withFootprint } from '../lib/footprint.js';
import { createRegistry } from '../prefabs/registry.js';
import { parseCatalog, CATALOG_VERSION } from '../editor/catalog.js';
import { pretty, setAt, removeAt } from '../editor/jsonEdit.js';
import { newSceneFiles } from '../editor/bundle.js';
import { objectBox } from './geometry.js';
import { typeText } from './keys.js';
import { viewFrom } from './prefabRules.js';

/**
 * A gallery for a scene's own object types: a room that shows each type on a stop of its own, and a catalog the
 * editor can offer them from. Pure: the scene's files and its types go in, the files to write come out, so the
 * command line, an MCP server and the tests all use it the same way (`node tools/scene.js showroom <scene>`).
 *
 * The room is laid out, not designed: a bay per type along the north wall (and the south wall too once the row
 * would pass 48 m), each type placed by what it stands on, each stop with a camera that takes the whole thing in.
 * What it writes passes `check --strict` by construction, as long as the scene has no scenery of its own in the way.
 */

const r1 = v => Math.round(v * 10) / 10;
const UNKNOWN = { min: [-1, 0, -1], max: [1, 2, 1], mount: 'floor', front: '+z', round: false };
const STANDS = { floor: 'stands on the floor', wall: 'hangs on a wall', ceiling: 'hangs from the ceiling', free: 'floats' };
/** How far from the wall each kind is set, in metres. */
const OUT = { floor: 0.6, wall: 0, ceiling: 2, free: 1.5 };
const ROW_LIMIT = 48;

/** What one type needs of the room: its box, a bay along the wall, and how far back its camera stands. */
function measure({ type, entry }) {
  let g = null;
  try { g = entry.geometry?.(entry.props) ?? null; } catch { /* `prefab check` reports it */ }
  g ??= UNKNOWN;
  const size = [0, 1, 2].map(i => g.max[i] - g.min[i]);
  return { type, entry, g, size, bay: Math.max(size[0] + 2, 5), reach: OUT[g.mount] + size[2], view: Math.max(2, viewFrom(g)) };
}

/** The `at` that sets a type in its bay: against the wall, at the height its mount asks for. */
function placeIn(item, wall, distance, height) {
  const { g, size } = item, at = { wall, distance: r1(distance) };
  if (g.mount === 'wall') { const h = g.min[1] > -0.01 ? 0 : r1(Math.max(-g.min[1] + 0.6, 2.4 - (g.min[1] + g.max[1]) / 2)); if (h) at.height = h; }
  else if (g.mount === 'ceiling') at.height = height;
  else if (g.mount === 'free') at.height = r1(Math.max(-g.min[1] + 0.2, 1.4 - (g.min[1] + g.max[1]) / 2, Math.min(height - 0.6 - g.max[1], 1.4 + size[1] / 2 - g.max[1])));
  if (OUT[g.mount]) at.offset = OUT[g.mount];
  return at;
}

/** A type's page: what it is, how big, its props and its clickable parts. Kept as written once it exists. */
function page(item) {
  const { type, entry, g, size } = item;
  let shape = {};
  try { shape = z.toJSONSchema(entry.schema, { io: 'input', unrepresentable: 'any' }).properties ?? {}; } catch { /* defaults only */ }
  const keys = Object.keys(entry.props), parts = entry.hotspots(entry.props);
  const cell = v => String(v).replace(/\|/g, '\\|');
  return [
    `# ${entry.title ?? type}`, '',
    `${entry.blurb ? `${entry.blurb.replace(/^./, c => c.toUpperCase())}. ` : ''}Type \`${type}\`: it ${STANDS[g.mount]} and is ${r1(size[0])} m wide, ${r1(size[1])} m high and ${r1(size[2])} m deep with its default settings.`, '',
    ...(keys.length ? ['| Setting | Type | Default | |', '| --- | --- | --- | --- |', ...keys.map(k => `| \`${k}\` | ${cell(typeText(shape[k]))} | \`${cell(JSON.stringify(entry.props[k]))}\` | ${cell(shape[k]?.description ?? '')} |`), ''] : ['It has no settings.', '']),
    parts.length ? `Clickable parts: ${parts.map(p => `\`${p}\``).join(', ')}.` : 'It has no clickable parts.', '',
  ].join('\n');
}

/**
 * The catalog of a scene's own types (`prefabs/catalog.json`, the format of src/editor/catalog.js), as text.
 * `own` is `[{ type, path, entry }]`; `previous` is the catalog's text so far: its title is kept, and so are its
 * entries for modules that are not this scene's files (another scene's, a host's).
 */
export function catalogFile({ own, previous = null, title = 'Objects' }) {
  let before = null;
  try { before = JSON.parse(previous ?? 'null'); } catch { /* replaced */ }
  const mine = new Set(own.map(o => o.type));
  const foreign = (Array.isArray(before?.prefabs) ? before.prefabs : []).filter(p => p && typeof p.url === 'string' && !mine.has(p.type) && /^(\.\.\/|[a-z]+:|\/)/i.test(p.url));
  const local = own.map(({ type, path, entry }) => {
    // the catalog sits in prefabs/, and a URL in it is relative to the catalog
    const url = path.startsWith('prefabs/') ? path.slice('prefabs/'.length) : `../${path}`;
    return { type, url, ...(entry.title ? { title: entry.title } : {}), ...(entry.blurb ? { blurb: entry.blurb } : {}), ...(entry.glyph ? { glyph: entry.glyph.trim() } : {}) };
  });
  const doc = { roomkit: CATALOG_VERSION, title: typeof before?.title === 'string' && before.title.trim() ? before.title : title, prefabs: [...local, ...foreign] };
  parseCatalog(JSON.stringify(doc), 'file:///scene/prefabs/catalog.json'); // what is written must be what the editor reads
  return `{\n  "roomkit": ${doc.roomkit},\n  "title": ${JSON.stringify(doc.title)},\n  "prefabs": [\n${doc.prefabs.map(p => `    ${JSON.stringify(p).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/","/g, '", "').replace(/":"/g, '": "')}`).join(',\n')}\n  ]\n}\n`;
}

/**
 * The showroom for a scene: `{ files, removed, summary }`. `files` is a Map of path → text to write (`scene.json` with
 * the room and the stop list changed and everything else as it was, a `poi/<type>.json` per type, a `content/<type>.md`
 * for each type that has no page yet, and the catalog); `removed` are the untouched files of a new scene's first stop,
 * which the showroom replaces; `summary` is what to tell the person.
 *
 * - `files`  the scene's text files so far (path → text), `scene.json` among them
 * - `own`    its own types, `[{ type, path, entry }]`, in the order of `scene.json › prefabs`
 */
export function showroomFiles({ name, files, own }) {
  if (!own.length) throw new Error(`${name} has no object types of its own: declare one in scene.json › prefabs (node tools/scene.js prefab new ${name} <type>)`);
  const items = own.map(measure);
  const total = items.reduce((s, it) => s + it.bay, 0);
  // one row along the north wall; two, facing each other, once that row would be too long to take in
  const split = total > ROW_LIMIT ? Math.ceil(items.length / 2) : items.length;
  const rows = [{ wall: 'north', items: items.slice(0, split) }, { wall: 'south', items: items.slice(split) }].filter(r => r.items.length);
  const width = Math.max(12, Math.ceil(Math.max(...rows.map(r => r.items.reduce((s, it) => s + it.bay, 0))) + 2));
  const back = r => Math.max(...r.items.map(it => it.reach + it.view)), deep = r => Math.max(...r.items.map(it => it.reach));
  const depth = Math.ceil(rows.length === 1 ? Math.max(12, back(rows[0]) + 2) : Math.max(14, back(rows[0]) + deep(rows[1]) + 2.2, back(rows[1]) + deep(rows[0]) + 2.2));
  const tallest = Math.max(...items.map(it => (it.g.mount === 'wall' ? (placeIn(it, 'north', 0, 0).height ?? 0) + it.g.max[1] : it.g.mount === 'floor' ? it.g.max[1] : it.size[1] + 2.4)));
  const height = Math.max(7, Math.ceil(tallest + 2));
  const room = withFootprint({ width, depth, height });
  const registry = createRegistry(Object.fromEntries(own.map(o => [o.type, o.entry])));

  const out = new Map(), stops = [], kept = [];
  for (const row of rows) {
    const used = row.items.reduce((s, it) => s + it.bay, 0);
    let along = (width - used) / 2;
    for (const item of row.items) {
      const { type, entry, g } = item;
      const at = placeIn(item, row.wall, along + item.bay / 2, height);
      along += item.bay;
      const placed = resolvePlacement({ type, name: type, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, props: entry.props, actions: {}, at: { height: 0, offset: 0, turn: 0, ...at } }, room, registry, (_, msg) => { throw new Error(`${type}: ${msg}`); });
      // a camera in front of it, far enough back to take all of it in, looking at its middle
      const box = objectBox(placed, registry), mid = (box.y0 + box.y1) / 2;
      const eye = Math.min(height - 0.6, Math.max(1.4, mid + 0.25 * (box.y1 - box.y0) + 0.4));
      const camera = { position: [r1(box.centre[0] + box.front[0] * item.view), r1(eye), r1(box.centre[1] + box.front[1] * item.view)], target: [r1(box.centre[0]), r1(mid), r1(box.centre[1])] };
      const marker = { position: [r1(box.centre[0]), r1(Math.min(height - 0.3, box.y1 + 0.6)), r1(box.centre[1])] };
      const file = `poi/${type}.json`, md = `content/${type}.md`;
      out.set(file, `${pretty({ id: type, label: entry.title ?? type, kicker: STANDS[g.mount], objects: [{ type, name: type, at }], camera, marker, content: { markdown: md } })}\n`);
      if (files.has(md)) kept.push(md); else out.set(md, page(item));
      stops.push(file);
    }
  }

  let scene = files.get('scene.json');
  const before = JSON.parse(scene);
  const lamps = Math.max(1, Math.round(width / 10));
  const lights = Array.from({ length: lamps }, (_, i) => [Math.round((-width / 2 + ((i + 0.5) * width) / lamps) * 100) / 100, r1(height - 0.4), 0]);
  for (const [path, value] of [[['room', 'width'], width], [['room', 'height'], height], [['room', 'depth'], depth], [['room', 'lights'], lights], [['room', 'skirting'], [0.35]], [['poi'], stops],
    [['camera', 'intro'], { position: [0, r1(height * 0.9), r1(depth / 2 + Math.max(width, depth) * 0.6)], target: [0, r1(height / 3), 0], duration: 3200 }]]) scene = setAt(scene, path, value);
  for (const path of [['room', 'footprint'], ['room', 'pillars'], ['room', 'walls'], ['camera', 'start'], ['camera', 'overview']]) scene = removeAt(scene, path);
  if (width > 36) scene = setAt(scene, ['theme', 'fog'], [14, Math.ceil(width * 1.4)]);
  out.set('scene.json', scene);
  out.set('prefabs/catalog.json', catalogFile({ own, previous: files.get('prefabs/catalog.json'), title: `${before.title ?? name} objects` }));

  // a scene made with `new` starts with one stop holding a pedestal: untouched, it makes way
  const scaffold = newSceneFiles(typeof before.title === 'string' ? before.title : undefined);
  const removed = ['poi/start.json', 'content/start.md'].filter(p => !stops.includes(p) && files.has(p) && files.get(p).trim() === scaffold.get(p).trim());
  const unlisted = (Array.isArray(before.poi) ? before.poi : []).filter(p => !stops.includes(p) && !removed.includes(p));
  return {
    files: out, removed,
    summary: [
      `${name}: a ${width} × ${depth} m room, ${height} m high, with ${stops.length} stop${stops.length === 1 ? '' : 's'}: ${items.map(it => it.type).join(', ')}`,
      `wrote scene.json (room, lights, stop list), ${stops.length} stop file${stops.length === 1 ? '' : 's'} in poi/, ${stops.length - kept.length} page${stops.length - kept.length === 1 ? '' : 's'} in content/ and prefabs/catalog.json`,
      ...(kept.length ? [`kept as written: ${kept.join(', ')}`] : []),
      ...(removed.length ? [`removed the untouched first stop of a new scene: ${removed.join(', ')}`] : []),
      ...(unlisted.length ? [`no longer in the tour (the files are left where they are): ${unlisted.join(', ')}`] : []),
      ...(Array.isArray(before.decor) && before.decor.length ? [`the scene's ${before.decor.length} scenery object${before.decor.length === 1 ? '' : 's'} (decor) stay where they were: the check will say if one is in the way`] : []),
    ],
  };
}
