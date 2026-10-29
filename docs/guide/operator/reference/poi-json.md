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
| `props` | object | prefab defaults | merged over the prefab's defaults (shallowly: an array such as `controlDesk.screens` replaces the default list); unknown props are ignored |

## Block

Inside `content.blocks`:

| `type` | Uses | Renders |
| --- | --- | --- |
| `markdown` | `text` (or `data`) | GFM Markdown; fenced `stats`/`cards`/`list`/`timeline`/`form` blocks inside it render as components |
| `heading` | `text` (or `data`) | scrambled H1 |
| `stats` | `data: [{ value, label }]` | row of figures |
| `cards` | `data: [{ title, text?, meta? }]` | two-column card grid (one column under 760 px) |
| `list` | `data: [{ title, text?, icon? = "/" }]` | icon list |
| `timeline` | `data: [{ title, text }]` | vertical timeline |
| `form` | `data: { fields: [{ name, label, type? = "text" \| "email" \| "textarea", autocomplete?, required?, rows? }], submit?, action? }` | form; with `action` it POSTs the fields as JSON and shows `ui.formSent` / `ui.formFailed`; without it shows `ui.formPrototype` |

A `{ markdown: path }` content is turned into a single `markdown` block at load time.
