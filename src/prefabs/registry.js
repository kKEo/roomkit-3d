/**
 * Prefab metadata, assembled from the `<Name>.meta.js` file next to each component.
 * No React here, so the config schema can import it. Each entry has:
 * - schema:    zod schema of the prefab's props; every key has a default, unknown keys are errors
 * - props:     the default props (`schema.parse({})`)
 * - media:     props holding a file path, resolved relative to the scene folder
 *              ("a.b" for a nested prop, "list[].prop" for a prop inside each item of an array prop)
 * - placement: local-space hints used to auto-place the camera and marker
 *              when a POI leaves them out. Prefabs face local +Z.
 * - hotspots:  names of the clickable parts a scene can bind `actions` to; a list, or a
 *              function of the props when the parts depend on them (screens of a controlDesk)
 * - geometry:  optional, a function of the props giving the solid body's box in local space, metres, before
 *              scale: `{ min: [x,y,z], max: [x,y,z], mount, front?, round? }`. `mount` says what the origin sits
 *              on: 'floor', 'wall' (the back of the box, z = 0, is the wall surface), 'ceiling' or 'free'.
 *              `front` is the side it faces, '+z' (default) or '-z'; `round` marks a disc-shaped footprint.
 *              Lines (cables, beams, captions) are left out. Scene checks and `at` placement use it; a prefab
 *              without one still renders, its geometry is just not checked.
 * - title, blurb, glyph: optional, how an editor shows the type (a name, one line, one or two characters)
 * - requires:  optional, the SDK versions a scene-shipped prefab was written for (`^1.0.0`); see metaSdk.js
 *
 * The built-in set is `BUILTIN`. A scene can add its own types (`scene.json › prefabs`, see
 * src/config/buildScene.js): `createRegistry(extra)` lays them over the built-ins, and every lookup
 * in the loader and the renderer goes through such a registry, never through `BUILTIN` directly.
 */
import { pedestal } from './Pedestal.meta.js';
import { pictureFrame } from './PictureFrame.meta.js';
import { wardrobe } from './Wardrobe.meta.js';
import { cinemaScreen } from './CinemaScreen.meta.js';
import { desk } from './Desk.meta.js';
import { controlDesk } from './ControlDesk.meta.js';
import { serverRack } from './ServerRack.meta.js';
import { door, bench, primitive } from './simple.meta.js';

const META = { pedestal, pictureFrame, wardrobe, cinemaScreen, desk, controlDesk, serverRack, door, bench, primitive };

/** A prefab type name: letters, digits and "_", starting with a lowercase letter. */
export const TYPE_NAME = /^[a-z][a-zA-Z0-9_]*$/;

const asFn = v => (typeof v === 'function' ? v : () => v ?? []);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = v => Array.isArray(v) && v.length === 3 && v.every(finite);

export const MOUNTS = ['floor', 'wall', 'ceiling', 'free'];

/** A prefab's `geometry()` result with the defaults filled in, or null when it has no solid body for these props. */
function checkGeometry(g) {
  if (g == null) return null;
  const ok = typeof g === 'object' && vec3(g.min) && vec3(g.max) && g.min.every((v, i) => v <= g.max[i])
    && MOUNTS.includes(g.mount) && (g.front == null || g.front === '+z' || g.front === '-z');
  if (!ok) throw new Error(`"geometry" must return { min: [x,y,z], max: [x,y,z], mount: ${MOUNTS.join(' | ')}, front?: "+z" | "-z", round? } with min ≤ max, or null`);
  return { min: g.min, max: g.max, mount: g.mount, front: g.front ?? '+z', round: !!g.round };
}

/**
 * Checks a prefab's meta and fills in the optional parts. Throws an Error whose message says what
 * is wrong, so a scene-shipped prefab's mistakes show on the loading screen. Extra fields (such as
 * `url` and `module` of a scene prefab) are kept.
 */
export function normalisePrefab(type, meta) {
  if (!TYPE_NAME.test(type)) throw new Error(`"${type}" is not a valid type name (letters, digits and "_", starting with a lowercase letter)`);
  if (!meta || typeof meta !== 'object') throw new Error('meta must be an object');
  if (typeof meta.schema?.safeParse !== 'function') throw new Error('"schema" must be a zod schema');
  const r = meta.schema.safeParse({});
  if (!r.success) throw new Error(`defaults do not validate (every prop needs a default): ${r.error.issues.map(i => `${i.path.join('.') || 'props'}: ${i.message}`).join('; ')}`);
  const props = r.data;
  if (meta.media != null && !(Array.isArray(meta.media) && meta.media.every(k => typeof k === 'string'))) throw new Error('"media" must be a list of prop paths');
  if (typeof meta.placement !== 'function') throw new Error('"placement" must be a function of the props');
  const h = meta.placement(props);
  if (!h || !vec3(h.focus) || !vec3(h.markerOffset) || !finite(h.cameraDistance) || !(h.cameraHeight == null || finite(h.cameraHeight))) {
    throw new Error('"placement" must return { focus: [x,y,z], markerOffset: [x,y,z], cameraDistance, cameraHeight? } with finite numbers');
  }
  if (meta.hotspots != null && typeof meta.hotspots !== 'function' && !Array.isArray(meta.hotspots)) throw new Error('"hotspots" must be a list of names or a function of the props');
  const hotspots = asFn(meta.hotspots);
  const names = hotspots(props);
  if (!Array.isArray(names) || !names.every(n => typeof n === 'string')) throw new Error('"hotspots" must give a list of names');
  if (meta.geometry != null && typeof meta.geometry !== 'function') throw new Error('"geometry" must be a function of the props');
  const geometry = meta.geometry ? p => checkGeometry(meta.geometry(p)) : null;
  if (geometry) geometry(props);
  for (const k of ['title', 'blurb', 'requires']) if (meta[k] != null && (typeof meta[k] !== 'string' || !meta[k].trim())) throw new Error(`"${k}" must be a non-empty string`);
  if (meta.glyph != null && (typeof meta.glyph !== 'string' || ![1, 2].includes([...meta.glyph.trim()].length))) throw new Error('"glyph" must be one or two characters');
  return { ...meta, media: meta.media ?? [], hotspots, props, geometry };
}

/** The prefabs compiled into the app. */
export const BUILTIN = Object.freeze(Object.fromEntries(Object.entries(META).map(([type, m]) => [type, normalisePrefab(type, m)])));

/** Built-ins plus a scene's own types; frozen, so a registry is never changed after it is made. */
export function createRegistry(extra = {}) {
  const all = { ...BUILTIN, ...extra };
  return Object.freeze({
    get: type => all[type],
    has: type => Object.hasOwn(all, type),
    types: () => Object.keys(all),
    entries: () => Object.entries(all),
    /** The scene's own types only ({ type: entry }). */
    extra: Object.freeze({ ...extra }),
  });
}

export const BUILTIN_REGISTRY = createRegistry();

// Built-in set under the historical names.
export const PREFABS = BUILTIN;
export const PREFAB_TYPES = Object.keys(BUILTIN);
