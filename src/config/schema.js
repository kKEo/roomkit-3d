import { z } from 'zod';
import { BUILTIN_REGISTRY, TYPE_NAME } from '../prefabs/registry.js';
import { EASE_NAMES } from '../lib/easing.js';
import { blockSchema } from '../ui/blocks/schema.js';
import { actionSchema } from '../actions/registry.js';
import { SCENE_DEFAULTS } from './defaults.js';
import { transformsDeclSchema } from '../data/feedSchema.js';
import { CORNER_NAMES, SIDES } from './placement.js';
import { unknownKeys } from './keyHelp.js';

/**
 * A strict object whose "unknown key" error names the key that was probably meant and lists the ones there are.
 * Every key's `.describe()` text is what `node tools/scene.js keys` prints (src/lint/keys.js): say what the key
 * does there, in a line, when you add one.
 */
const strict = shape => z.strictObject(shape, { error: iss => (iss.code === 'unrecognized_keys' ? unknownKeys(iss.keys, Object.keys(shape)) : undefined) });

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const vec2 = z.tuple([z.number(), z.number()]);
const positive = z.number().positive();
const scale3 = z.tuple([positive, positive, positive]);

/** `scene.json › prefabs`: the scene's own object types, type → module path (relative to the scene folder) or URL. */
export const prefabsDeclSchema = z.record(
  z.string().regex(TYPE_NAME, 'a type name is letters, digits and "_", starting with a lowercase letter'),
  z.string().min(1, 'give the path or URL of the prefab module'),
);

const color = z.string().min(3);

/** The keys that go with each form of `at`, besides the one that names the form. */
const AT_FORMS = { wall: ['face', 'along', 'distance', 'height', 'offset', 'turn'], corner: ['inset', 'height'], centre: ['shift', 'height'], near: ['side', 'gap', 'height'] };
const quoted = list => list.map(k => `"${k}"`).join(', ');

/**
 * `objects[].at`: where an object stands, in words instead of coordinates; src/config/placement.js works out the
 * position and rotation. One of four forms, named by its first key: `wall` (a compass side, north is −Z, the
 * wall's number in `room.footprint`, or an interior wall's name with its `face`), `corner` (a compass corner or the vertex's number), `centre` (the middle of
 * the floor) or `near` (the `name` of another object). One strict object rather than a union of four, so a wrong
 * value is reported at its own key.
 */
export const atSchema = strict({
  wall: z.union([z.number().int().min(0), z.string().min(1)], { error: 'a wall is "north", "south", "east", "west", its number in room.footprint or the name of one of room.walls' }).optional()
    .describe('form 1, on or against a wall: a compass side (north is −Z), the wall\'s number in room.footprint, or the name of an interior wall (room.walls) with its "face". A wall object lands on the wall, any other stands with its back to it'),
  corner: z.union([z.enum(CORNER_NAMES), z.number().int().min(0)], { error: `a corner is ${quoted(CORNER_NAMES)} or its number in room.footprint` }).optional()
    .describe('form 2, in a corner, touching both walls: a compass corner or the vertex\'s number in room.footprint; looks diagonally into the room unless "facing" is given'),
  centre: z.literal(true, { error: 'write "centre": true for the middle of the room' }).optional()
    .describe('form 3, the middle of the floor: always true'),
  near: z.string({ error: 'the "name" of the object to stand next to' }).min(1, 'the "name" of the object to stand next to').optional()
    .describe('form 4, next to another object: that object\'s "name"; looks the way it does unless "facing" is given'),
  face: z.enum(['north', 'south', 'east', 'west'], { error: 'a face is "north", "south", "east" or "west": the side of the wall it looks to' }).optional()
    .describe('wall: which face of an interior wall, by the side it looks to ("south" is the face seen from the south); only for a wall of room.walls'),
  along: z.number().min(0, 'a fraction 0–1; use "distance" for metres').max(1, 'a fraction 0–1; use "distance" for metres').optional()
    .describe('wall: where along it, 0 (its left end, seen from inside the room) to 1; default 0.5'),
  distance: z.number().min(0).optional().describe('wall: the same in metres from its left end; give this or "along"'),
  height: z.number().optional().describe('every form: the origin\'s y; default 0 (a frame: its centre height; next to a wall object: that object\'s height)'),
  offset: z.number().optional().describe('wall: metres out from the wall into the room; default 0'),
  turn: z.number().optional().describe('wall: extra yaw in degrees; default 0 faces straight into the room'),
  inset: z.number().min(0).optional().describe('corner: metres kept from both walls; default 0'),
  shift: vec2.optional().describe('centre: [east, south] metres away from the middle; default [0, 0]'),
  side: z.enum(SIDES, { error: `a side is ${quoted(SIDES)}` }).optional()
    .describe('near: which side of that object; left and right are as seen standing in front of it; default "right"'),
  gap: z.number().min(0).optional().describe('near: metres between the two outlines; default 0.3'),
}).transform((at, ctx) => {
  const forms = Object.keys(AT_FORMS).filter(k => at[k] !== undefined);
  if (forms.length !== 1) {
    ctx.addIssue({ code: 'custom', message: forms.length ? `give one of ${quoted(Object.keys(AT_FORMS))}, not ${forms.map(f => `"${f}"`).join(' and ')} together` : `say where: one of ${quoted(Object.keys(AT_FORMS))}` });
    return z.NEVER;
  }
  const [form] = forms;
  let ok = true;
  for (const k of Object.keys(at)) {
    if (k === form || at[k] === undefined || AT_FORMS[form].includes(k)) continue;
    ok = false;
    ctx.addIssue({ code: 'custom', path: [k], message: `"${k}" goes with ${quoted(Object.keys(AT_FORMS).filter(f => AT_FORMS[f].includes(k)))}, not with "${form}"` });
  }
  if (at.along != null && at.distance != null) { ok = false; ctx.addIssue({ code: 'custom', message: 'give "along" (a fraction) or "distance" (metres), not both' }); }
  if (!ok) return z.NEVER;
  if (form === 'wall') return { ...at, height: at.height ?? 0, offset: at.offset ?? 0, turn: at.turn ?? 0 };
  if (form === 'corner') return { ...at, inset: at.inset ?? 0, height: at.height ?? 0 };
  if (form === 'centre') return { ...at, shift: at.shift ?? [0, 0], height: at.height ?? 0 };
  // next to another object: `height` stays open, the floor or that object's height (see placement.js)
  return { ...at, side: at.side ?? 'right', gap: at.gap ?? 0.3 };
});

/** Every interface string, typed from the defaults so a misspelt key is an error rather than silently ignored. */
const uiSchema = strict(Object.fromEntries(
  Object.entries(SCENE_DEFAULTS.ui).map(([k, v]) => [k, typeof v === 'object' ? z.record(z.string(), z.string()) : z.string()]),
));

/**
 * The schemas that depend on which prefab types exist. A scene's own prefabs are known only once
 * its `prefabs` modules are loaded, so buildScene makes a set per scene from that scene's registry;
 * the module-level `objectSchema`, `poiSchema` and `sceneSchema` below know the built-in types.
 */
export function makeSchemas(registry = BUILTIN_REGISTRY) {
  const objectType = z.string().refine(t => registry.has(t), {
    error: iss => `unknown object type "${iss.input}" (known: ${registry.types().join(', ')})`,
  });

  /**
   * A placed object. `props` are validated with the prefab's own schema (see src/prefabs/*.meta.js),
   * which fills in every default and rejects unknown keys, so a misspelt prop is reported at load time.
   * `actions` binds an action to each named hotspot the prefab exposes for those props.
   */
  const objectSchema = strict({
    type: objectType.describe('the object type: see `node tools/scene.js prefabs`'),
    name: z.string().optional().describe('what other objects, the brief and the editor call it; the viewer does not show it. Unique when it is referred to'),
    position: vec3.optional().describe('[x, y, z] of its origin in metres; y 0 is the floor, north is −Z, east is +X. Or use "at"'),
    rotation: vec3.optional().describe('[x, y, z] degrees; yaw (y) 0 faces south, 90 east, 180 north, −90 west. Or use "facing"'),
    at: atSchema.optional().describe('where it stands, in words, instead of position and rotation: see `keys at`'),
    facing: z.string({ error: 'a compass direction, "centre" or the "name" of another object' }).min(1, 'a compass direction, "centre" or the "name" of another object').optional()
      .describe('which way it looks, instead of rotation: north, north-east, …, "centre" (the middle of the room) or another object\'s "name"'),
    scale: z.union([positive, scale3]).default(1).describe('a number or [x, y, z]'),
    props: z.record(z.string(), z.any()).default({}).describe('the type\'s settings, each with a default: see `node tools/scene.js prefabs`'),
    actions: z.record(z.string(), actionSchema).default({}).describe('what a click on a part does: { "<clickable part>": action }; see `keys actions`'),
  }).transform((raw, ctx) => {
    if (raw.at && (raw.position || raw.rotation)) ctx.addIssue({ code: 'custom', path: ['at'], message: 'give "at" or "position"/"rotation", not both' });
    if (raw.facing != null && raw.rotation) ctx.addIssue({ code: 'custom', path: ['facing'], message: 'give "facing" or "rotation", not both' });
    if (raw.facing != null && raw.at?.turn) ctx.addIssue({ code: 'custom', path: ['at', 'turn'], message: 'give "turn" or "facing", not both' });
    const o = { ...raw, position: raw.position ?? [0, 0, 0], rotation: raw.rotation ?? [0, 0, 0] };
    const prefab = registry.get(o.type);
    const r = prefab.schema.safeParse(o.props);
    if (!r.success) {
      for (const i of r.error.issues) {
        // a misspelt prop: say which props the type (or that part of it) has, as far as its defaults tell
        const there = i.code === 'unrecognized_keys' ? i.path.reduce((v, k) => v?.[k], prefab.props) : null;
        const known = there && typeof there === 'object' && !Array.isArray(there) ? Object.keys(there) : [];
        ctx.addIssue({ code: 'custom', message: known.length ? unknownKeys(i.keys, known) : i.message, path: ['props', ...i.path] });
      }
      return z.NEVER;
    }
    let hotspots;
    try { hotspots = prefab.hotspots(r.data); } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['props'], message: `hotspots() of "${o.type}" failed: ${e?.message ?? e}` });
      return z.NEVER;
    }
    let ok = true;
    for (const name of Object.keys(o.actions)) {
      if (hotspots.includes(name)) continue;
      ok = false;
      ctx.addIssue({ code: 'custom', path: ['actions', name], message: `"${o.type}" has no hotspot "${name}" (it has: ${hotspots.join(', ') || 'none'})` });
    }
    return ok ? { ...o, props: r.data } : z.NEVER;
  });

  const poiSchema = strict({
    id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id may contain only letters, digits, "-" and "_"').describe('unique in the scene; the #hash in the address, and what goTo actions name'),
    label: z.string().min(1).describe('the stop\'s name in the top bar, on its marker and as its number key\'s title'),
    kicker: z.string().optional().describe('a few words shown after "NN of NN" above the panel title'),
    screenLabel: z.string().optional().describe('the caption in the rain on screens while here; default the label in lower case'),
    objects: z.array(objectSchema).min(1, 'a point of interest needs at least one object').describe('what stands at this stop, at least one; the automatic camera frames the first. See `keys object`'),
    camera: strict({ position: vec3, target: vec3 }).optional().describe('{ position, target }: where a visitor stands and looks; default in front of the first object, 4–12 m back by type'),
    marker: strict({ position: vec3 }).optional().describe('{ position }: the floating diamond; default above the first object'),
    content: z.union([
      strict({ markdown: z.string() }),
      strict({ blocks: z.array(blockSchema) }),
    ]).describe('the panel: { "markdown": "content/<id>.md" } or { "blocks": [ … ] }; see `keys blocks`'),
  });

  /** Every section is strict: with the defaults merged in, an unknown key can only be a typo. */
  const sceneSchema = strict({
    title: z.string().describe('the page title'),
    brand: z.string().describe('the logo text in the top bar; each "/" is drawn dimmed'),
    lang: z.string().describe('the page language, <html lang>'),
    room: strict({
      width: positive.describe('metres east–west (x); the room is centred on the origin. Ignored when footprint is given'),
      height: positive.describe('metres floor to ceiling'),
      depth: positive.describe('metres north–south (z). Ignored when footprint is given'),
      /** floor plan as [x, z] corners; default the width × depth rectangle centred on the origin */
      footprint: z.array(vec2).min(3, 'a footprint needs at least three corners').optional().describe('the floor outline as [x, z] corners in order, for an L or any other shape; wall 0 runs from the first corner to the second'),
      grid: strict({
        floor: z.number().nonnegative().describe('floor grid spacing in metres; 0 = none'),
        ceiling: z.number().nonnegative().describe('ceiling grid spacing; 0 = none'),
      }),
      wallPanels: z.number().nonnegative().describe('spacing of the vertical wall lines; 0 = none'),
      skirting: z.array(z.number()).describe('heights of the horizontal wall lines; keep them under the ceiling'),
      pillars: z.array(vec2).describe('[x, z] of round pillars, floor to ceiling'),
      walls: z.array(strict({
        name: z.string().min(1).refine(s => !['north', 'south', 'east', 'west'].includes(s), 'a wall\'s name is not a compass side, which names the room\'s own walls').describe('what objects (`at: { wall, face }`), expectations and the read-back call it; unique'),
        from: vec2.describe('[x, z] of one end'),
        to: vec2.describe('[x, z] of the other end'),
        thickness: positive.default(0.2).describe('metres; default 0.2'),
        height: positive.optional().describe('metres; default the ceiling. A camera flies over a wall more than a metre under the ceiling'),
        openings: z.array(strict({
          along: z.number().min(0).max(1).optional().describe('where its centre is, 0 (the "from" end) to 1 (the "to" end); default 0.5'),
          distance: z.number().min(0).optional().describe('the same in metres from the "from" end; give this or "along"'),
          width: positive.default(1.2).describe('metres; default 1.2. A flight between stops goes through an opening at least 0.8 m wide'),
          height: positive.default(2.4).describe('metres from the floor; default 2.4. Higher than the wall: open to the top'),
        })).default([]).describe('doorways: gaps in the wall a camera can fly through'),
      })).describe('interior walls that split the floor plan into rooms, each with its openings; see `keys walls`'),
      lights: z.array(vec3).min(1, 'at least one light is required').describe('[x, y, z] of each light, at least one, inside the room and about 0.4 m under the ceiling'),
    }),
    theme: strict({
      accent: color.describe('lines, hatching, titles, buttons'),
      accentInk: color.describe('text on accent-coloured buttons; must contrast with accent'),
      highlight: color.describe('marker glow, rain captions, the camera on the minimap'),
      background: color.describe('the room\'s darkness: clear colour, fog, rain fade'),
      text: color.describe('panel text; must contrast with background and surface'),
      textDim: color.describe('secondary text'),
      surface: color.describe('panel background; may be rgba()'),
      fog: vec2.describe('[near, far] metres from the camera; raise both in a room over 30 m'),
      fontsUrl: z.string().optional().describe('a stylesheet with the fonts; "" = none'),
      fonts: strict({ display: z.string().describe('CSS font-family of titles, the logo and numbers'), body: z.string().describe('CSS font-family of everything else') }),
      hatch: strict({
        density: z.number().describe('hatch lines per metre on main surfaces'),
        fineDensity: z.number().describe('on small parts'),
        roomDensity: z.number().describe('on the room\'s shell'),
        roomStrength: z.number().describe('brightness of the shell\'s hatching, 0–1'),
      }),
      scanlines: z.boolean().describe('the scanline overlay'),
      vignette: z.boolean().describe('darkened corners'),
      glyphs: z.string().min(1).describe('the characters the rain and scrambled headings use'),
    }),
    camera: strict({
      fov: z.number().describe('vertical view angle in degrees, landscape windows'),
      fovPortrait: z.number().describe('the same for windows taller than wide'),
      intro: strict({
        position: vec3.describe('where the first flight starts; outside the room by default, so set it for a room that is not 30 m'),
        target: vec3.describe('where it looks at the start'),
        duration: positive.describe('milliseconds of the first flight'),
      }),
      overview: strict({ position: vec3, target: vec3 }).optional().describe('{ position, target } of the whole-room view; default outside the south wall, above the ceiling'),
      /** where the page opens when the address has no `#poi`: a POI id, a fixed pose, or null for the overview */
      start: z.union([z.string().min(1), strict({ position: vec3, target: vec3 })]).nullable().optional().describe('where the page opens: a stop id, { position, target }, or null for the whole-room view'),
      /** whether visitors may take the camera by hand (WASD / QE, middle-drag) */
      freeFly: z.boolean().describe('whether visitors may fly the camera by hand'),
      collide: z.boolean().describe('whether walls, pillars and the ceiling stop a camera flown by hand once it is inside the room; false = it flies through them'),
    }),
    effects: strict({
      ease: z.enum(EASE_NAMES).describe('the curve of flights between stops'),
      parallax: z.number().min(0).describe('how much the view follows the mouse; 0 = still'),
      warp: z.number().min(0).describe('extra view angle in degrees mid-flight; 0 = none'),
      particles: z.number().int().min(0).describe('falling dust specks; 0 = none'),
      panelOffset: z.number().describe('fraction of the width the picture shifts while the panel is open'),
      markers: z.boolean().describe('whether the floating diamonds show at the start'),
    }),
    ui: uiSchema.describe('every text of the interface, for another language; see `keys ui`'),
    /** the live event this scene is shown in: the sync server (ws:// or wss://; default the page's origin) and the event name (`?event=` overrides) */
    multiplayer: strict({
      url: z.string().regex(/^wss?:\/\//, 'the sync server is a ws:// or wss:// URL').nullable().describe('the sync server, ws:// or wss://; null = the page\'s own origin'),
      event: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,63}$/i, 'an event name is letters, digits, "-" and "_"').nullable().describe('the shared event every visitor joins; null = a plain viewer'),
    }),
    // the scene's own prefab modules; defaulted here rather than in SCENE_DEFAULTS, see buildScene
    prefabs: prefabsDeclSchema.default({}).describe('the scene\'s own object types: { "<type>": "prefabs/<type>.js" }'),
    // functions that turn live feed responses into screen fields or block data; also defaulted here
    transforms: transformsDeclSchema.default({}).describe('functions for live feeds: { "<name>": "data/feeds.js#export" }'),
    decor: z.array(objectSchema).describe('objects that belong to no stop (doors, benches, lamps); see `keys object`'),
    poi: z.array(z.string()).min(1, 'list at least one POI file').describe('the stop files in tour order: ["poi/<id>.json", …]; at least one'),
  });

  return { objectSchema, poiSchema, sceneSchema };
}

export const { objectSchema, poiSchema, sceneSchema } = makeSchemas();

/** Throws an Error whose message lists every issue as "file › path: message". */
export function parseOrThrow(schema, data, file) {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const lines = r.error.issues.map(i => `${file}${i.path.length ? ' › ' + i.path.join('.') : ''}: ${i.message}`);
  throw new ConfigError(lines);
}

export class ConfigError extends Error {
  constructor(lines) {
    super(lines.join('\n'));
    this.lines = lines;
  }
}
