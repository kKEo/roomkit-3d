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
| `facing` | a compass direction, `"centre"` or an object's `name` | — | which way the object looks, **instead of** `rotation`; see [Facing](#facing) |
| `at` | `{ wall … }`, `{ corner … }`, `{ centre … }` or `{ near … }` | — | where it stands, in words, **instead of** `position` and `rotation`; see [Placing in words](#placing-in-words) |
| `scale` | number > 0 or `[x, y, z]` | `1` | also scales the auto-placed marker, but not the camera distance |
| `props` | object | prefab defaults | validated with the prefab's schema: missing keys get their defaults, an array such as `controlDesk.screens` replaces the default list, and a wrong type or unknown key is a load error |
| `actions` | `{ hotspot: Action }` | `{}` | makes parts of the object clickable; see [Actions and hotspots](actions.md) |

### Placing in words

`at` says where an object stands and the loader works out the position and rotation, so nobody has to compute where a wall is, how deep a desk is or which way faces into the room. It takes one of four forms, named by its first key. `at` together with `position` or `rotation` is an error; `height`, the origin's `y`, goes with every form.

#### Placing by wall

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

A wall object (frame, door, cinema screen) lands on the wall surface. Any other object is set with its outline touching the wall, using the size its prefab declares: its back when it faces into the room, whichever side meets the wall when it is turned. A wall the room does not have is an error:

```text
loft/poi/wall.json › objects.0.at.wall: "south" names 2 walls of this room (edges 2 and 4); give the edge index
```

#### In a corner

```json
{ "type": "desk", "at": { "corner": "north-east", "inset": 0.3 }, "facing": "west" }
```

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `corner` | `"north-east"`, `"south-east"`, `"south-west"`, `"north-west"` or a number | — | the corner between those two walls. A number is the vertex's place in `room.footprint`, for a room where two corners share a name. An inner corner (the elbow of an L) is not one: nothing can stand in it |
| `inset` | metres ≥ 0 | `0` | how far the object's outline stays from both walls |

Left to itself the object looks diagonally into the room; `facing` turns it, and it still touches both walls.

#### In the middle

```json
{ "type": "pedestal", "at": { "centre": true, "shift": [2, -3] } }
```

`centre` is always `true`: the centre of the floor's area, which for an L-shaped room is not the middle of its bounding box. `shift` is `[east, south]` metres away from it, default `[0, 0]`. The object faces south, towards the default view, unless `facing` says otherwise.

#### Next to another object

```json
{ "type": "desk", "name": "desk", "position": [8, 0, -7], "facing": "west" }
{ "type": "bench", "at": { "near": "desk", "side": "front", "gap": 1 }, "facing": "desk" }
```

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `near` | the other object's `name` | — | any object of the scene, in the scenery or in any stop |
| `side` | `"left"`, `"right"`, `"front"`, `"behind"`, `"north"`, `"south"`, `"east"`, `"west"` | `"right"` | `left` and `right` are as someone standing in front of that object, looking at it, sees them; the compass sides do not depend on how it is turned |
| `gap` | metres ≥ 0 | `0.3` | between the two outlines, measured along that side's direction |
| `height` | number | the floor | a wall object next to another takes that one's height, so two frames hang level |

Side by side, the two objects' centres are in line. The new one looks the way its neighbour does unless `facing` says otherwise.

An object is referred to by its `name`, and by nothing else: positions in a list and types change when a scene is edited. A name that is referred to must belong to exactly one object. The order in the files does not matter, and an object may stand next to one that is itself placed in words. Objects that stand next to each other in a circle cannot be placed:

```text
demo/scene.json › decor.1.at.near: no object is named "table" (named objects: desk, plinth)
demo/poi/a.json › objects.0.at.near: these objects stand next to each other in a circle: "a" → "b" → "a"; give one of them a position
```

### Facing

`facing` says which way an object looks, in place of `rotation`. It goes with `position` and with every form of `at` (with a wall, in place of `turn`).

| Value | Looks |
| --- | --- |
| `"north"`, `"north-east"`, `"east"`, `"south-east"`, `"south"`, `"south-west"`, `"west"`, `"north-west"` | that way; north is −Z |
| `"centre"` | at the middle of the room, from where it stands |
| any other string | at the object with that `name`; two objects may face each other |

It is the prefab's front that is turned there, whichever local axis that is, so a row of cinema seats (which face −Z) needs no special care. `facing` together with `rotation` is an error.

`node tools/scene.js describe <scene>` lists the walls with their names and lengths, and says for every object how it was placed (`placed at: …`, `turned to face: …`). In the editor an object placed this way shows **placed at** or **facing** in the inspector; moving or turning it with the handles, or pressing **Convert to position** or **Convert to rotation**, writes the numbers in place of the words. Renaming an object there takes along the objects that stand next to it or face it; deleting it leaves them with an error until they are given another place.

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
