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
| `camera` | `{ position: [x,y,z], target: [x,y,z] }` | no | default: auto-placed from `objects[0]`, and pulled back inside the room if that would put it behind a wall |
| `marker` | `{ position: [x,y,z] }` | no | default: auto-placed from `objects[0]` |
| `content` | `{ markdown: path }` or `{ blocks: Block[] }` | yes | |

## Object

Used in `objects` and in `scene.json` `decor`.

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | one of the [prefab types](prefabs.md) | — | an unknown type fails validation and lists the known ones |
| `name` | string | — | what the editor's scene tree calls the object; the viewer does not show it. Without it the tree shows the screen id or the type, numbered when it repeats |
| `position` | `[x, y, z]` | `[0, 0, 0]` | the prefab's origin (see its "origin" column) |
| `rotation` | `[x, y, z]` degrees | `[0, 0, 0]` | Euler XYZ; prefabs face local +Z, so `y` picks the facing |
| `at` | `{ wall, … }` | — | placement by wall, **instead of** `position` and `rotation`; see [Placing by wall](#placing-by-wall) |
| `scale` | number > 0 or `[x, y, z]` | `1` | also scales the auto-placed marker, but not the camera distance |
| `props` | object | prefab defaults | validated with the prefab's schema: missing keys get their defaults, an array such as `controlDesk.screens` replaces the default list, and a wrong type or unknown key is a load error |
| `actions` | `{ hotspot: Action }` | `{}` | makes parts of the object clickable; see [Actions and hotspots](actions.md) |

### Placing by wall

`at` names a wall and the loader works out the position and rotation, so nobody has to compute where a wall is or which way faces into the room:

```json
{ "type": "pictureFrame", "at": { "wall": "west", "along": 0.4, "height": 3 } }
{ "type": "wardrobe", "at": { "wall": "north", "distance": 2.5 } }
```

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `wall` | `"north"`, `"south"`, `"east"`, `"west"` or a number | — | north is −Z, the far wall of the default view; east is +X. A number is the wall's place in `room.footprint` (wall `0` runs from the first corner to the second), for a room where two walls face the same way or one runs at an angle |
| `along` | 0–1 | `0.5` | where along the wall, from its left end to its right, seen from inside the room |
| `distance` | metres ≥ 0 | — | the same from the left end in metres; give `along` or `distance`, not both |
| `height` | number | `0` | the origin's `y`: `0` for a door or a wardrobe, the centre height for a picture frame |
| `offset` | number | `0` | metres out from the wall into the room |
| `turn` | degrees | `0` | extra turn; `0` faces straight into the room |

A wall object (frame, door, cinema screen) lands on the wall surface. Any other object is set with its back against the wall, using the size its prefab declares. `at` together with `position` or `rotation` is an error, as is a wall the room does not have:

```text
loft/poi/wall.json › objects.0.at.wall: "south" names 2 walls of this room (edges 2 and 4); give the edge index
```

`node tools/scene.js describe <scene>` lists the walls with their names and lengths. In the editor an object placed this way shows **placed at** in the inspector; moving it with the handles, or pressing **Convert to position**, writes `position` and `rotation` in place of `at`.

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
| `form` | `data: { fields: [{ name, label, type? = "text" \| "email" \| "textarea", autocomplete?, required?, rows? }], submit?, action? }` | form; with `action` it POSTs the fields as JSON (no cookies; the origin must pass `VITE_DATA_ORIGINS`) and shows `ui.formSent` / `ui.formFailed`; without it shows `ui.formPrototype`. `autocomplete` takes contact-detail tokens only (`AUTOCOMPLETE` in `src/ui/blocks/schema.js`): never cards or passwords |

A `{ markdown: path }` content is turned into a single `markdown` block at load time. Blocks in `content.blocks` are validated at load time (`src/ui/blocks/schema.js`); fenced blocks inside Markdown are validated when the panel renders.

`stats`, `cards`, `list` and `timeline` take a `feed` (a URL, or `{ url, refresh, stream, transform }`) to load their `data` live; a `data` given too is shown until the first answer. In Markdown, write the fence body as an object: ```` ```stats ```` then `{ "feed": "data/kpi.json", "data": [...] }`. See [Live data](../extending/live-data.md).
