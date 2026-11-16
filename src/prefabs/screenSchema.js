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
 * One screen's configuration. Every key but `source` is optional; each key's description says which
 * sources read it (printed by `node tools/scene.js keys screen`). `id` keeps the screen's zoom/session state
 * stable. With `feed`, the other fields are placeholders until the first response arrives.
 */
export const screenSchema = z.strictObject({
  source: z.enum(SCREEN_SOURCES).default('rain').describe('what the screen shows; terminal, dashboard and form can be used once zoomed in'),
  src: z.string().nullable().optional().describe('image, video: the file, relative to the scene folder (a video ending in .m3u8 is a live stream)'),
  label: z.string().optional().describe('rain: a caption in the middle of this screen\'s own rain'),
  title: z.string().optional().describe('every drawn source: the text in the title bar'),
  lines: z.array(line).optional().describe('text: the lines typed out, about 7 fit; terminal: the banner before the first command'),
  graph: z.enum(GRAPH_KINDS).optional().describe('graph: which kind; default wave'),
  color: color.optional().describe('every drawn source: a colour for this screen alone; default theme.accent'),
  prompt: z.string().optional().describe('terminal: the text before the input; default "> "'),
  commands: z.record(z.string(), z.union([line, z.array(line)])).optional().describe('terminal: { "name": "one line" | ["several", "lines"] }; help, clear, goto and exit are built in'),
  rows: z.array(z.record(z.string(), z.any())).optional().describe('dashboard: the records, flat objects'),
  columns: z.array(z.string()).optional().describe('dashboard: the fields to show, in order; default the first row\'s keys'),
  filters: z.array(z.string()).optional().describe('dashboard: fields that get filter chips'),
  value: z.string().optional().describe('dashboard: a numeric field drawn as a bar'),
  form: formSchema.optional().describe('form: { fields, submit, action }, as the panel\'s form block'),
  /** graph data: bars (one per value) or the wave's series; without it the graph animates demo data */
  values: z.array(z.number()).max(256).optional().describe('graph: one bar each, or the wave\'s series; without it the graph animates demo data'),
  /** radar blips: `angle` in degrees clockwise from the top, `distance` from the centre (0–1) */
  points: z.array(z.strictObject({ angle: z.number(), distance: z.number().min(0).max(1), label: z.string().optional() })).max(64).optional().describe('graph (radar): blips, angle in degrees clockwise from the top, distance 0–1'),
  /** the value range a graph scales `values` to; default the data's own range (bars from 0) */
  min: z.number().optional().describe('graph: the bottom of the value range'),
  max: z.number().optional().describe('graph: the top of the value range'),
  /** the text in a graph's title bar, instead of the value it computes */
  readout: line.optional().describe('graph: title-bar text instead of the computed value'),
  /** the numbers of a stats screen (up to 8) */
  stats: z.array(statItem).max(8).optional().describe('stats: up to 8 big numbers'),
  zoom: z.boolean().default(true).describe('false makes the screen not clickable'),
  id: z.string().optional().describe('names the screen: the clickable part actions bind to, and what keeps its state'),
  /** live data: the screen's fields are merged from it over the ones given here (src/data/feedSchema.js) */
  feed: feedSchema.optional().describe('live data merged over the keys above: a URL or { url, refresh, stream, transform }'),
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
