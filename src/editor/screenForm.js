import { screenSchema, screenOrSource } from '../prefabs/screenSchema.js';
import { DECOR, parseKey, locate, objectAt, setObjectField } from './tree.js';
import { insertAt, removeAt, rawAt } from './jsonEdit.js';

/**
 * The model behind the inspector's screen editor (src/editor/ScreenEditor.jsx): which props of a prefab hold
 * screens, what each source reads, which hotspot a screen answers to, and the file edits that change a screen,
 * the list of screens and the actions bound to them. No React here.
 */

/** What each source shows and the keys it reads, in the order the form lists them. */
export const SOURCES = {
  rain: { glyph: '⋮', label: 'Rain', blurb: 'falling code; a caption or a colour gives the screen its own rain', keys: ['label', 'color'] },
  image: { glyph: '▣', label: 'Image', blurb: 'a picture, from the scene folder or a URL', keys: ['src'] },
  video: { glyph: '▶', label: 'Video', blurb: 'a muted looping video, or an .m3u8 live stream', keys: ['src'] },
  text: { glyph: '≡', label: 'Text', blurb: 'lines typed out like a console, then again after 5 s', keys: ['title', 'lines', 'color'] },
  graph: { glyph: '∿', label: 'Graph', blurb: 'a wave, bars or a radar, from your numbers or demo data', keys: ['title', 'graph', 'values', 'points', 'min', 'max', 'readout', 'color'] },
  stats: { glyph: '#', label: 'Stats', blurb: 'up to 8 big numbers with labels, units and ▲▼ changes', keys: ['title', 'stats', 'color'] },
  terminal: { glyph: '›', label: 'Terminal', blurb: 'visitors type commands once zoomed in', keys: ['title', 'prompt', 'lines', 'commands', 'color'], interactive: true },
  dashboard: { glyph: '▤', label: 'Dashboard', blurb: 'a table visitors filter once zoomed in', keys: ['title', 'rows', 'columns', 'filters', 'value', 'color'], interactive: true },
  form: { glyph: '✎', label: 'Form', blurb: 'a form visitors fill in once zoomed in', keys: ['title', 'form', 'color'], interactive: true },
};

/** Keys every source keeps when the source changes. */
const SHARED = ['source', 'id', 'zoom', 'feed'];

const unwrap = s => {
  for (;;) {
    const t = s?.def?.type;
    if (t === 'default' || t === 'prefault' || t === 'optional' || t === 'nullable' || t === 'readonly') s = s.def.innerType;
    else return s;
  }
};

/**
 * How a prop's schema holds screens: `{ kind: 'screens' }` for a list of screen configs (a control desk's wall),
 * `{ kind: 'screen', names }` for one (a desk's monitor; `names` when a bare source name is allowed too), or null.
 * Found by identity, so a scene's own prefab that uses the SDK's `screenSchema` / `screenOrSource` gets it as well.
 */
export function screenKind(schema) {
  const s = unwrap(schema);
  if (s === screenSchema) return { kind: 'screen', names: false };
  if (s === screenOrSource) return { kind: 'screen', names: true };
  if (s?.def?.type === 'array' && unwrap(s.def.element) === screenSchema) return { kind: 'screens' };
  return null;
}

/** A screen as written (a source name, a config, nothing) as a config object, or null. */
export const asScreen = v => (typeof v === 'string' ? { source: v } : v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** The object's props with the prefab's defaults filled in, as `hotspots` expects them; the written ones when they do not validate. */
export function fullProps(entry, props) {
  const r = entry.schema.safeParse(props ?? {});
  return r.success ? r.data : { ...entry.props, ...(props ?? {}) };
}

const names = (entry, props) => { try { return entry.hotspots(props) ?? []; } catch { return []; } };
/** The names of an object's clickable parts, as the prefab gives them for its props. */
export const hotspotNames = (entry, obj) => names(entry, fullProps(entry, obj.props));

const PROBE = '\u0000probe';

function withScreen(props, field, index, screen) {
  if (index == null) return { ...props, [field]: screen };
  const list = [...(props[field] ?? [])];
  list[index] = screen;
  return { ...props, [field]: list };
}

/**
 * The hotspot a screen answers to, found by asking the prefab: `{ hotspot, byId, fallback }`. `byId` when the
 * screen's `id` names it (a control desk: `id`, else `scr0`, `scr1`, … the `fallback`); otherwise the hotspot is the
 * prop's own name when the prefab has one by that name (a cinema screen's `screen`), else null.
 */
export function slotHotspot(entry, props, field, index) {
  const screen = asScreen(index == null ? props[field] : props[field]?.[index]) ?? {};
  const { id: _id, ...bare } = screen;
  const probe = names(entry, withScreen(props, field, index, { ...bare, id: PROBE }));
  if (probe.includes(PROBE)) {
    const without = names(entry, withScreen(props, field, index, bare));
    const fallback = without.find(n => !probe.includes(n)) ?? null;
    return { hotspot: screen.id ?? fallback, byId: true, fallback };
  }
  return { hotspot: names(entry, props).includes(field) ? field : null, byId: false, fallback: null };
}

/**
 * Every screen an object holds: `{ field, index (null for a single screen), screen, written, hotspot, byId, fallback,
 * names }`. `screen` is the config as written, or the prefab's default when the object leaves it out (`written` false).
 */
export function screenSlots(entry, obj, fields = Object.keys(entry.schema.shape ?? {})) {
  const props = fullProps(entry, obj.props);
  const out = [];
  for (const f of fields.map(x => (typeof x === 'string' ? { key: x } : x))) {
    const k = screenKind(entry.schema.shape?.[f.key] ?? null);
    if (!k) continue;
    const own = obj.props?.[f.key];
    if (k.kind === 'screen') {
      const screen = own !== undefined ? asScreen(own) : asScreen(entry.props[f.key]) && compact(asScreen(entry.props[f.key]));
      out.push({ field: f.key, index: null, screen, written: own !== undefined, names: k.names, ...slotHotspot(entry, props, f.key, null) });
    } else {
      const list = Array.isArray(own) ? own : (entry.props[f.key] ?? []).map(compact);
      list.forEach((s, i) => out.push({ field: f.key, index: i, screen: asScreen(s), written: Array.isArray(own), names: false, ...slotHotspot(entry, props, f.key, i) }));
    }
  }
  return out;
}

/** The problems with one screen as `{ key: message }`, from the same schema the loader uses. */
export function screenIssues(screen) {
  if (!screen) return {};
  const r = screenSchema.safeParse(screen);
  if (r.success) return {};
  const out = {};
  for (const i of r.error.issues) {
    const k = i.path[0] ?? 'screen';
    out[k] ??= i.path.length > 1 ? `${i.path.slice(1).join('.')}: ${i.message}` : i.message;
  }
  return out;
}

/** The keys a screen loses when its source changes to `source` (those the new source does not read). */
export const droppedBy = (screen, source) => Object.keys(screen ?? {}).filter(k => !SHARED.includes(k) && !SOURCES[source]?.keys.includes(k));

/** A default screen as the schema fills it, without the values that are defaults anyway (`{}` for a plain rain). */
const compact = s => Object.fromEntries(Object.entries(s).filter(([k, v]) => !(k === 'source' && v === 'rain') && !(k === 'zoom' && v === true)));

// ── file edits ────────────────────────────────────────────────────────────────

const objPath = key => { const { owner, index } = parseKey(key); const { file, list } = locate(owner); return { file, path: [...list, index] }; };
const edit = (files, file, text) => new Map(files).set(file, text);

/** The list of screens as written, writing out the prefab's default list first when the object leaves it out. */
function ensureList(files, key, entry, field) {
  if (Array.isArray(objectAt(files, key)?.props?.[field])) return files;
  return setObjectField(files, key, ['props', field], (entry.props[field] ?? []).map(compact));
}

/**
 * Makes sure the screen is written as an object in the file, so a key of it can be set: a list the object still
 * takes from the prefab's defaults is written out, a bare source name becomes `{ "source": … }`.
 */
function ensureScreen(files, key, entry, slot) {
  if (slot.index != null) {
    const next = ensureList(files, key, entry, slot.field);
    const item = objectAt(next, key).props[slot.field][slot.index];
    return item && typeof item === 'object' ? next : setObjectField(next, key, ['props', slot.field, slot.index], asScreen(item) ?? {});
  }
  const written = objectAt(files, key)?.props?.[slot.field];
  if (written && typeof written === 'object' && !Array.isArray(written)) return files;
  const start = asScreen(written) ?? asScreen(entry.props[slot.field]) ?? { source: 'rain' };
  return setObjectField(files, key, ['props', slot.field], compact(start));
}

/** The screen's config object as the file has it, or null when it is not written as one. */
function writtenScreen(files, key, slot) {
  const v = objectAt(files, key)?.props?.[slot.field];
  const s = slot.index == null ? v : Array.isArray(v) ? v[slot.index] : undefined;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}

const screenPath = slot => ['props', slot.field, ...(slot.index == null ? [] : [slot.index])];

/** Sets one key of a screen (`undefined` removes it). */
export function setScreenKey(files, key, entry, slot, k, value) {
  if (value === undefined && !(k in (writtenScreen(files, key, slot) ?? {}))) return files;
  const next = ensureScreen(files, key, entry, slot);
  return setObjectField(next, key, [...screenPath(slot), k], value);
}

/** Switches a screen to another source, dropping the keys only the old one read. */
export function setSource(files, key, entry, slot, source) {
  let next = ensureScreen(files, key, entry, slot);
  for (const k of droppedBy(writtenScreen(next, key, slot), source)) next = setObjectField(next, key, [...screenPath(slot), k], undefined);
  return setObjectField(next, key, [...screenPath(slot), 'source'], source);
}

/** Binds `action` to a hotspot, or unbinds it (`null`); the `actions` map goes away with its last entry. */
export function setAction(files, key, hotspot, action) {
  const actions = objectAt(files, key)?.actions;
  if (!action) {
    if (!actions || !(hotspot in actions)) return files;
    return setObjectField(files, key, Object.keys(actions).length === 1 ? ['actions'] : ['actions', hotspot], undefined);
  }
  return setObjectField(files, key, ['actions', hotspot], action);
}

/**
 * What a screen does when clicked: `'zoom'` (the default), `'none'` (`zoom: false`, no action) or a bound action.
 * The click setting of the form writes both halves together.
 */
export function setClick(files, key, entry, slot, click) {
  let next = files;
  if (slot.hotspot) next = setAction(next, key, slot.hotspot, typeof click === 'object' ? click : null);
  const zoom = writtenScreen(files, key, slot)?.zoom;
  if (click === 'none') return zoom === false ? next : setScreenKey(next, key, entry, slot, 'zoom', false);
  return setScreenKey(next, key, entry, slot, 'zoom', undefined);
}

/** Renames a screen (its `id`); an action bound to its old hotspot moves to the new one. */
export function setScreenId(files, key, entry, slot, id) {
  const next = setScreenKey(files, key, entry, slot, 'id', id || undefined);
  if (!slot.byId || !slot.hotspot) return next;
  const action = objectAt(files, key)?.actions?.[slot.hotspot];
  const to = id || slot.fallback;
  if (!action || !to || to === slot.hotspot) return next;
  return setAction(setAction(next, key, slot.hotspot, null), key, to, action);
}

/**
 * Applies a change to a list of screens (`op(text, listPath)` → text) and carries the actions bound to screens named
 * by their place in the list (`scr0`, `scr1`, …) along with them: `moved(i)` gives each old index its new one, or -1.
 */
function relist(files, key, entry, field, op, moved) {
  let next = ensureList(files, key, entry, field);
  const before = objectAt(next, key);
  const { file, path } = objPath(key);
  next = edit(next, file, op(next.get(file), [...path, 'props', field]));
  const after = objectAt(next, key);
  const actions = before.actions;
  if (!actions || !Object.keys(actions).length) return next;
  const nameAt = (obj, i) => slotHotspot(entry, fullProps(entry, obj.props), field, i).hotspot;
  const n = before.props[field].length, m = after.props[field].length;
  const oldNames = Array.from({ length: n }, (_, i) => nameAt(before, i));
  const newNames = Array.from({ length: m }, (_, j) => nameAt(after, j));
  const out = Object.fromEntries(Object.entries(actions).filter(([h]) => !oldNames.includes(h)));
  oldNames.forEach((h, i) => { const j = moved(i); if (h in actions && j >= 0 && newNames[j]) out[newNames[j]] = actions[h]; });
  const same = JSON.stringify(Object.entries(out).sort()) === JSON.stringify(Object.entries(actions).sort());
  return same ? next : setObjectField(next, key, ['actions'], Object.keys(out).length ? out : undefined);
}

/** Adds a screen to a list at `at` (default the end): a copy of `screen` without its id, or a plain rain. */
export function addScreen(files, key, entry, field, at = -1, screen = {}) {
  const { id: _id, ...copy } = screen;
  const n = (objectAt(files, key)?.props?.[field] ?? entry.props[field] ?? []).length;
  const pos = at < 0 || at > n ? n : at;
  return relist(files, key, entry, field, (t, p) => insertAt(t, p, pos, { value: copy }), i => (i >= pos ? i + 1 : i));
}

/** Removes the screen at `index` and the action bound to it. */
export function removeScreen(files, key, entry, field, index) {
  return relist(files, key, entry, field, (t, p) => removeAt(t, [...p, index]), i => (i === index ? -1 : i > index ? i - 1 : i));
}

/** Moves the screen at `from` to `to`, keeping its text as written. */
export function moveScreen(files, key, entry, field, from, to) {
  return relist(files, key, entry, field, (t, p) => insertAt(removeAt(t, [...p, from]), p, to, { raw: rawAt(t, [...p, from]) }), i => {
    if (i === from) return to;
    if (from < to) return i > from && i <= to ? i - 1 : i;
    return i >= to && i < from ? i + 1 : i;
  });
}

/** A cinema screen without a full config shows its own `source` / `src`: turns them into one, so the form can set it up. */
export function startScreen(files, key, entry, field) {
  const obj = objectAt(files, key) ?? {};
  const props = fullProps(entry, obj.props);
  const screen = { source: typeof props.source === 'string' ? props.source : 'rain', ...(props.src ? { src: props.src } : {}) };
  let next = setObjectField(files, key, ['props', field], screen);
  for (const k of ['source', 'src']) if (obj.props && k in obj.props && entry.schema.shape?.[k]) next = setObjectField(next, key, ['props', k], undefined);
  return next;
}

/** Whether the object sits in the scenery, where a screen is not zoomable unless an action is bound to it. */
export const inScenery = key => parseKey(key).owner === DECOR;

/** The transforms `scene.json` declares, for the feed's picker. */
export function transformNames(files) {
  try { return Object.keys(JSON.parse(files.get('scene.json')).transforms ?? {}); } catch { return []; }
}
