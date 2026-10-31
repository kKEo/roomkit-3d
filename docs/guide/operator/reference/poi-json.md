# POI file reference

This page lists every key of a point-of-interest file (`poi/*.json`). Coordinates are metres in room space; rotations are degrees.

## Keys

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string matching `^[a-z0-9][a-z0-9-_]*$` (case-insensitive) | yes | unique per scene; used in the URL hash |
| `label` | non-empty string | yes | nav, marker label, pager |
| `kicker` | string | no | appended to "NN of NN" above the panel title |
| `screenLabel` | string | no | rain caption while here; default `label.toLowerCase()` |
| `objects` | object[] (at least 1) | yes | see below |
| `camera` | `{ position: [x,y,z], target: [x,y,z] }` | no | default: auto-placed from `objects[0]` |
| `marker` | `{ position: [x,y,z] }` | no | default: auto-placed from `objects[0]` |
| `content` | `{ markdown: path }` or `{ blocks: Block[] }` | yes | |

## Object

Used in `objects` and in `scene.json` `decor`.

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | one of the [prefab types](prefabs.md) | — | an unknown type fails validation and lists the known ones |
| `position` | `[x, y, z]` | `[0, 0, 0]` | the prefab's origin (see its "origin" column) |
| `rotation` | `[x, y, z]` degrees | `[0, 0, 0]` | Euler XYZ; prefabs face local +Z, so `y` picks the facing |
| `scale` | number > 0 or `[x, y, z]` | `1` | also scales the auto-placed marker, but not the camera distance |
| `props` | object | prefab defaults | validated with the prefab's schema: missing keys get their defaults, an array such as `controlDesk.screens` replaces the default list, and a wrong type or unknown key is a load error |
| `actions` | `{ hotspot: Action }` | `{}` | makes parts of the object clickable; see [Actions and hotspots](actions.md) |

## Block

Inside `content.blocks`:

| `type` | Uses | Renders |
| --- | --- | --- |
| `markdown` | `text` (or `data`) | GFM Markdown; fenced `stats`/`cards`/`list`/`timeline`/`form` blocks inside it render as components |
| `heading` | `text` (or `data`) | scrambled H1 |
| `stats` | `data: [{ value, label, unit?, delta? }]`, and/or `feed` | row of figures; `unit` small after the value, `delta` like `"+4%"` shown as ▲/▼ |
| `cards` | `data: [{ title, text?, meta? }]`, and/or `feed` | two-column card grid (one column under 760 px) |
| `list` | `data: [{ title, text?, icon? = "/" }]`, and/or `feed` | icon list |
| `timeline` | `data: [{ title, text }]`, and/or `feed` | vertical timeline |
| `form` | `data: { fields: [{ name, label, type? = "text" \| "email" \| "textarea", autocomplete?, required?, rows? }], submit?, action? }` | form; with `action` it POSTs the fields as JSON and shows `ui.formSent` / `ui.formFailed`; without it shows `ui.formPrototype` |

A `{ markdown: path }` content is turned into a single `markdown` block at load time. Blocks in `content.blocks` are validated at load time (`src/ui/blocks/schema.js`); fenced blocks inside Markdown are validated when the panel renders.

`stats`, `cards`, `list` and `timeline` take a `feed` (a URL, or `{ url, refresh, stream, transform }`) to load their `data` live; a `data` given too is shown until the first answer. In Markdown, write the fence body as an object: ```` ```stats ```` then `{ "feed": "data/kpi.json", "data": [...] }`. See [Live data](../extending/live-data.md).
