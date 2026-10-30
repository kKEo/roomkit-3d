import { z } from 'zod';

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

/** `data` schema per block type; `markdown` and `heading` take `text` instead. */
export const BLOCK_DATA = {
  stats: z.array(z.strictObject({ value: text, label: text })),
  cards: z.array(z.strictObject({ title: text, text: text.optional(), meta: text.optional() })),
  list: z.array(z.strictObject({ title: text, text: text.optional(), icon: text.optional() })),
  timeline: z.array(z.strictObject({ title: text, text: text.optional() })),
  form: formSchema,
};

export const BLOCK_TYPES = ['markdown', 'heading', ...Object.keys(BLOCK_DATA)];

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
  ...Object.entries(BLOCK_DATA).map(([type, data]) => z.strictObject({ type: z.literal(type), data })),
]);
