import { z } from 'zod';
import { BUILTIN_REGISTRY, TYPE_NAME } from '../prefabs/registry.js';
import { EASE_NAMES } from '../lib/easing.js';
import { blockSchema } from '../ui/blocks/schema.js';
import { actionSchema } from '../actions/registry.js';
import { SCENE_DEFAULTS } from './defaults.js';

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

/** Every interface string, typed from the defaults so a misspelt key is an error rather than silently ignored. */
const uiSchema = z.strictObject(Object.fromEntries(
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
  const objectSchema = z.strictObject({
    type: objectType,
    position: vec3.default([0, 0, 0]),
    rotation: vec3.default([0, 0, 0]),
    scale: z.union([positive, scale3]).default(1),
    props: z.record(z.string(), z.any()).default({}),
    actions: z.record(z.string(), actionSchema).default({}),
  }).transform((o, ctx) => {
    const prefab = registry.get(o.type);
    const r = prefab.schema.safeParse(o.props);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue({ code: 'custom', message: i.message, path: ['props', ...i.path] });
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

  const poiSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id may contain only letters, digits, "-" and "_"'),
    label: z.string().min(1),
    kicker: z.string().optional(),
    screenLabel: z.string().optional(),
    objects: z.array(objectSchema).min(1, 'a point of interest needs at least one object'),
    camera: z.strictObject({ position: vec3, target: vec3 }).optional(),
    marker: z.strictObject({ position: vec3 }).optional(),
    content: z.union([
      z.strictObject({ markdown: z.string() }),
      z.strictObject({ blocks: z.array(blockSchema) }),
    ]),
  });

  /** Every section is strict: with the defaults merged in, an unknown key can only be a typo. */
  const sceneSchema = z.strictObject({
    title: z.string(),
    brand: z.string(),
    lang: z.string(),
    room: z.strictObject({
      width: positive,
      height: positive,
      depth: positive,
      /** floor plan as [x, z] corners; default the width × depth rectangle centred on the origin */
      footprint: z.array(vec2).min(3, 'a footprint needs at least three corners').optional(),
      grid: z.strictObject({ floor: z.number().nonnegative(), ceiling: z.number().nonnegative() }),
      wallPanels: z.number().nonnegative(),
      skirting: z.array(z.number()),
      pillars: z.array(vec2),
      lights: z.array(vec3).min(1, 'at least one light is required'),
    }),
    theme: z.strictObject({
      accent: color, accentInk: color, highlight: color, background: color,
      text: color, textDim: color, surface: color,
      fog: vec2,
      fontsUrl: z.string().optional(),
      fonts: z.strictObject({ display: z.string(), body: z.string() }),
      hatch: z.strictObject({
        density: z.number(), fineDensity: z.number(), roomDensity: z.number(), roomStrength: z.number(),
      }),
      scanlines: z.boolean(),
      vignette: z.boolean(),
      glyphs: z.string().min(1),
    }),
    camera: z.strictObject({
      fov: z.number(),
      fovPortrait: z.number(),
      intro: z.strictObject({ position: vec3, target: vec3, duration: positive }),
      overview: z.strictObject({ position: vec3, target: vec3 }).optional(),
    }),
    effects: z.strictObject({
      ease: z.enum(EASE_NAMES),
      parallax: z.number().min(0),
      warp: z.number().min(0),
      particles: z.number().int().min(0),
      panelOffset: z.number(),
      markers: z.boolean(),
    }),
    ui: uiSchema,
    // the scene's own prefab modules; defaulted here rather than in SCENE_DEFAULTS, see buildScene
    prefabs: prefabsDeclSchema.default({}),
    decor: z.array(objectSchema),
    poi: z.array(z.string()).min(1, 'list at least one POI file'),
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
