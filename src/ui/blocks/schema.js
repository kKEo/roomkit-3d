import { z } from 'zod';
import { feedSchema } from '../../data/feedSchema.js';

/**
 * Schemas for panel content blocks (no React here, so the config loader can import them).
 * A block is validated when the scene loads (`content.blocks`) and again when a fenced
 * ```type block inside Markdown is rendered, so both paths report the same mistakes.
 */

const text = z.union([z.string(), z.number()]).transform(String);

export const formSchema = z.strictObject({
  fields: z.array(z.strictObject({
    name: z.string().min(1),
    label: z.string().optional(),
    type: z.enum(['text', 'email', 'tel', 'url', 'number', 'textarea']).default('text'),
    autocomplete: z.string().optional(),
    required: z.boolean().optional(),
    rows: z.number().int().positive().optional(),
  })).default([]),
  submit: z.string().optional(),
  action: z.string().optional(),
});

/** One number of a stats block or a stats screen: `delta` like "+4%" or -2 shows as up/down, `unit` small after the value. */
export const statItem = z.strictObject({ value: text, label: text, delta: text.optional(), unit: text.optional() });

/** "up", "down" or "flat" for a delta: a leading "+" or a positive number is up, "-"/"−" or a negative number down. */
export function deltaDirection(delta) {
  const s = String(delta ?? '').trim();
  if (/^\+/.test(s)) return 'up';
  if (/^[-−]/.test(s)) return 'down';
  const n = Number(s);
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

/** `data` schema per block type; `markdown` and `heading` take `text` instead. */
export const BLOCK_DATA = {
  stats: z.array(statItem),
  cards: z.array(z.strictObject({ title: text, text: text.optional(), meta: text.optional() })),
  list: z.array(z.strictObject({ title: text, text: text.optional(), icon: text.optional() })),
  timeline: z.array(z.strictObject({ title: text, text: text.optional() })),
  form: formSchema,
};

export const BLOCK_TYPES = ['markdown', 'heading', ...Object.keys(BLOCK_DATA)];

/** Blocks that can load their `data` from a `feed`; `data` is then the placeholder until it answers. */
export const FEED_BLOCKS = ['stats', 'cards', 'list', 'timeline'];

const needsData = b => b.data !== undefined || b.feed !== undefined;

/** The JSON body of a fenced feed block: ```stats { "feed": "data/kpi.json", "data": [...] } ``` (type known from the fence). */
export const feedBlockSchema = type => z.strictObject({ data: BLOCK_DATA[type].optional(), feed: feedSchema });

/** `{ ok: true, data }` with defaults filled in, or `{ ok: false, issues }`; an unknown type passes `data` through. */
export function parseBlockData(type, data) {
  const schema = BLOCK_DATA[type];
  if (!schema) return { ok: true, data };
  const r = schema.safeParse(data);
  return r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error.issues };
}

const textBlock = type => z.object({ type: z.literal(type), text: text.optional(), data: text.optional() })
  .transform(b => ({ type, text: b.text ?? b.data ?? '' }));

export const blockSchema = z.discriminatedUnion('type', [
  textBlock('markdown'),
  textBlock('heading'),
  ...Object.entries(BLOCK_DATA).map(([type, data]) => (FEED_BLOCKS.includes(type)
    ? z.strictObject({ type: z.literal(type), data: data.optional(), feed: feedSchema.optional() }).refine(needsData, 'give data, feed, or both')
    : z.strictObject({ type: z.literal(type), data }))),
]);
