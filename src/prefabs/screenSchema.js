import { z } from 'zod';
import { formSchema, statItem } from '../ui/blocks/schema.js';
import { feedSchema } from '../data/feedSchema.js';

/** Screen sources a `ScreenSurface` can show (see src/prefabs/media.jsx). */
export const SCREEN_SOURCES = ['rain', 'image', 'video', 'text', 'graph', 'stats', 'terminal', 'dashboard', 'form'];
/** Sources with a DOM overlay you can use once zoomed in. */
export const INTERACTIVE_SOURCES = ['terminal', 'dashboard', 'form'];
export const GRAPH_KINDS = ['wave', 'bars', 'radar'];

/** An HLS live stream (`.m3u8`) for a video screen: played natively (Safari) or with hls.js, loaded on demand. */
export const isHls = src => typeof src === 'string' && /\.m3u8([?#]|$)/i.test(src);

const line = z.union([z.string(), z.number()]).transform(String);

/**
 * A CSS colour a screen config (or a feed) may give: `#hex`, `rgb()`/`hsl()` with plain numbers, or a
 * colour name. It ends up in a canvas `fillStyle` and the overlay's `--accent`, so nothing else is let through.
 */
export const CSS_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[\d.%\s,/-]+\s*\)|[a-z]{3,30})$/i;
const color = z.string().regex(CSS_COLOR, 'a colour is #hex, rgb()/hsl() or a colour name');

/**
 * One screen's configuration. Every key but `source` is optional; which ones a source reads
 * is listed in the prefab reference. `id` keeps the screen's zoom/session state stable.
 * With `feed`, the other fields are placeholders until the first response arrives.
 */
export const screenSchema = z.strictObject({
  source: z.enum(SCREEN_SOURCES).default('rain'),
  src: z.string().nullable().optional(),
  label: z.string().optional(),
  title: z.string().optional(),
  lines: z.array(line).optional(),
  graph: z.enum(GRAPH_KINDS).optional(),
  color: color.optional(),
  prompt: z.string().optional(),
  commands: z.record(z.string(), z.union([line, z.array(line)])).optional(),
  rows: z.array(z.record(z.string(), z.any())).optional(),
  columns: z.array(z.string()).optional(),
  filters: z.array(z.string()).optional(),
  value: z.string().optional(),
  form: formSchema.optional(),
  /** graph data: bars (one per value) or the wave's series; without it the graph animates demo data */
  values: z.array(z.number()).max(256).optional(),
  /** radar blips: `angle` in degrees clockwise from the top, `distance` from the centre (0–1) */
  points: z.array(z.strictObject({ angle: z.number(), distance: z.number().min(0).max(1), label: z.string().optional() })).max(64).optional(),
  /** the value range a graph scales `values` to; default the data's own range (bars from 0) */
  min: z.number().optional(),
  max: z.number().optional(),
  /** the text in a graph's title bar, instead of the value it computes */
  readout: line.optional(),
  /** the numbers of a stats screen (up to 8) */
  stats: z.array(statItem).max(8).optional(),
  zoom: z.boolean().default(true),
  id: z.string().optional(),
  /** live data: the screen's fields are merged from it over the ones given here (src/data/feedSchema.js) */
  feed: feedSchema.optional(),
});

/**
 * What a feed may set on a screen: any field but `source`, `feed`, `id` and `zoom`, all optional.
 * Still strict, so a misspelt key in a feed response is reported rather than ignored. A feed may change
 * a form's fields and labels but never its `action`: data decides what a form shows, the scene author
 * decides where it submits (src/data/live.js keeps the author's).
 */
export const liveScreenSchema = screenSchema
  .omit({ source: true, feed: true, id: true, zoom: true })
  .extend({ form: formSchema.omit({ action: true }).optional() })
  .partial();

/** A bare source name or a full screen config, normalised to the config. */
export const screenOrSource = z.union([z.enum(SCREEN_SOURCES).transform(source => screenSchema.parse({ source })), screenSchema]);
