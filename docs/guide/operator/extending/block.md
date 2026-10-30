# Adding a content block

This page shows how to add a new panel block, for example `quote`, usable both as a fenced block in Markdown and in `content.blocks`. One file changes.

## 1. Describe its data

In `src/ui/blocks/schema.js`, add the block's `data` schema to `BLOCK_DATA`:

```js
quote: z.strictObject({ text: z.string(), by: z.string().optional() }),
```

That makes `{ type: "quote", data }` valid in `content.blocks` (checked when the scene loads) and in a fenced ```` ```quote ```` block (checked when the panel renders). Mistakes are reported with the field's path.

## 2. Write and register the component

In `src/ui/blocks/index.jsx`, add a component that takes `{ data }`, and add it to `BLOCKS`:

```jsx
export function Quote({ data }) {
  return (
    <blockquote className="quote">
      <p>{data.text}</p>
      {data.by && <cite>{data.by}</cite>}
    </blockquote>
  );
}

export const BLOCKS = { stats: Stats, cards: Cards, list: List, timeline: Timeline, form: Form, quote: Quote };
```

That is all the wiring. `src/ui/Markdown.jsx` renders any fenced block whose language is a key of `BLOCKS` by parsing its body as JSON and validating it with the schema. `Panel.jsx` renders `{ type: "quote", data }` from `content.blocks` through the same `Block` component. Parse errors, validation errors and unknown types are shown in red in the panel.

## 3. Style it

Add CSS to `src/styles.css` using the theme variables (`--accent`, `--text`, `--text-dim`, `--line`, `--display`, `--body`) so it follows every scene's theme.

## 4. Document and test it

Add it to the block table in the [POI file reference](../reference/poi-json.md) and to the content guide's [panel content page](../../user/content.md), and a case to `test/blocks.test.js`.
