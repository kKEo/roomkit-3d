import { z } from 'zod';
import { formSchema } from '../ui/blocks/schema.js';

/** Screen sources a `ScreenSurface` can show (see src/prefabs/media.jsx). */
export const SCREEN_SOURCES = ['rain', 'image', 'video', 'text', 'graph', 'terminal', 'dashboard', 'form'];
/** Sources with a DOM overlay you can use once zoomed in. */
export const INTERACTIVE_SOURCES = ['terminal', 'dashboard', 'form'];
export const GRAPH_KINDS = ['wave', 'bars', 'radar'];

const line = z.union([z.string(), z.number()]).transform(String);

/**
 * One screen's configuration. Every key but `source` is optional; which ones a source reads
 * is listed in the prefab reference. `id` keeps the screen's zoom/session state stable.
 */
export const screenSchema = z.strictObject({
  source: z.enum(SCREEN_SOURCES).default('rain'),
  src: z.string().nullable().optional(),
  label: z.string().optional(),
  title: z.string().optional(),
  lines: z.array(line).optional(),
  graph: z.enum(GRAPH_KINDS).optional(),
  color: z.string().optional(),
  prompt: z.string().optional(),
  commands: z.record(z.string(), z.union([line, z.array(line)])).optional(),
  rows: z.array(z.record(z.string(), z.any())).optional(),
  columns: z.array(z.string()).optional(),
  filters: z.array(z.string()).optional(),
  value: z.string().optional(),
  form: formSchema.optional(),
  zoom: z.boolean().default(true),
  id: z.string().optional(),
});

/** A bare source name or a full screen config, normalised to the config. */
export const screenOrSource = z.union([z.enum(SCREEN_SOURCES).transform(source => screenSchema.parse({ source })), screenSchema]);
