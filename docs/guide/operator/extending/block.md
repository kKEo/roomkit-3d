# Adding a content block

This page shows how to add a new panel block, for example `quote`, usable both as a fenced block in Markdown and in `content.blocks`. One file changes.

## 1. Write and register the component

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

That is all the wiring. `src/ui/Markdown.jsx` renders any fenced block whose language is a key of `BLOCKS` by parsing its body as JSON. `Panel.jsx` renders `{ type: "quote", data }` from `content.blocks` through the same `Block` component. Parse errors and unknown types are shown in red in the panel.

## 2. Style it

Add CSS to `src/styles.css` using the theme variables (`--accent`, `--text`, `--text-dim`, `--line`, `--display`, `--body`) so it follows every scene's theme.

## 3. Document it

Add it to the block table in the [POI file reference](../reference/poi-json.md) and to the content guide's [panel content page](../../user/content.md).

> **Note.** Blocks are not validated when the scene loads. A typo shows up only when someone opens that panel. When you add blocks with required fields, check them in the component and render a clear message rather than throwing.
