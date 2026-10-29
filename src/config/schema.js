import { z } from 'zod';
import { PREFAB_TYPES } from '../prefabs/registry.js';
import { EASE_NAMES } from '../lib/easing.js';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const vec2 = z.tuple([z.number(), z.number()]);

const objectType = z.string().refine(t => PREFAB_TYPES.includes(t), {
  error: iss => `unknown object type "${iss.input}" (known: ${PREFAB_TYPES.join(', ')})`,
});

export const objectSchema = z.object({
  type: objectType,
  position: vec3.default([0, 0, 0]),
  rotation: vec3.default([0, 0, 0]),
  scale: z.union([z.number().positive(), vec3]).default(1),
  props: z.record(z.string(), z.any()).default({}),
});

const blockSchema = z.object({ type: z.string(), data: z.any().optional(), text: z.string().optional() });

export const poiSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id may contain only letters, digits, "-" and "_"'),
  label: z.string().min(1),
  kicker: z.string().optional(),
  screenLabel: z.string().optional(),
  objects: z.array(objectSchema).min(1, 'a point of interest needs at least one object'),
  camera: z.object({ position: vec3, target: vec3 }).optional(),
  marker: z.object({ position: vec3 }).optional(),
  content: z.union([
    z.object({ markdown: z.string() }),
    z.object({ blocks: z.array(blockSchema) }),
  ]),
});

const color = z.string().min(3);

export const sceneSchema = z.object({
  title: z.string(),
  brand: z.string(),
  lang: z.string(),
  room: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    grid: z.object({ floor: z.number().nonnegative(), ceiling: z.number().nonnegative() }),
    wallPanels: z.number().nonnegative(),
    skirting: z.array(z.number()),
    pillars: z.array(vec2),
    lights: z.array(vec3).min(1, 'at least one light is required'),
  }),
  theme: z.object({
    accent: color, accentInk: color, highlight: color, background: color,
    text: color, textDim: color, surface: color,
    fog: vec2,
    fontsUrl: z.string().optional(),
    fonts: z.object({ display: z.string(), body: z.string() }),
    hatch: z.object({
      density: z.number(), fineDensity: z.number(), roomDensity: z.number(), roomStrength: z.number(),
    }),
    scanlines: z.boolean(),
    vignette: z.boolean(),
    glyphs: z.string().min(1),
  }),
  camera: z.object({
    fov: z.number(),
    fovPortrait: z.number(),
    intro: z.object({ position: vec3, target: vec3, duration: z.number().positive() }),
    overview: z.object({ position: vec3, target: vec3 }).optional(),
  }),
  effects: z.object({
    ease: z.enum(EASE_NAMES),
    parallax: z.number().min(0),
    warp: z.number().min(0),
    particles: z.number().int().min(0),
    panelOffset: z.number(),
    markers: z.boolean(),
  }),
  ui: z.record(z.string(), z.any()),
  decor: z.array(objectSchema),
  poi: z.array(z.string()).min(1, 'list at least one POI file').max(9, 'at most 9 POIs (number keys 1–9)'),
});

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
