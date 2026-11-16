---
name: build-prefab
description: Write a new RoomKit object type (a scene prefab module) from a description, check it without a browser, and turn a set of types into a showroom scene with a catalog. Use when asked for a new kind of object (a sofa, a floor lamp, a kiosk), for a pack or gallery of object types, or to fix a type that renders wrong or whose size is off.
---

# Writing an object type from a description

An object type ("prefab") that a scene brings along is one JavaScript module in the scene's `prefabs/` folder. It has two exports: `meta`, which describes the type (its props, its size, what is clickable), and `component`, which draws it from boxes, cylinders and lines. The viewer loads it at run time, so nothing in `src/` changes.

You cannot see what you write, so the tools see it for you: `prefab check` renders the component in Node with the real renderer's building blocks and compares what comes out with what `meta` claims, and `prefab describe` prints the parts and draws the outline. Both take well under a second. Use them after every change.

## 1. Decide where it lives

- One or two types for an existing scene: add them to that scene.
- A set of types to hand over or look at (a "pack", a "gallery"): make a scene for it, `node tools/scene.js new <pack> --title="…"`. Step 6 turns it into a showroom.

```sh
node tools/scene.js prefab new <scene> <type> --mount=floor --title="Side table"
```

`<type>` is letters, digits and `_`, starting lowercase (`sideTable`). `--mount` says what the origin sits on: `floor` (the default), `wall`, `ceiling` or `free`. This writes `prefabs/<type>.js`, one box that follows three size props, and declares it in `scene.json › prefabs`. It passes the check as it stands, so you start from green.

## 2. Design it in writing

Before the code, write the object down as a short parts list; step 5 is read against it.

- **Parts**: each one a simple shape with its size in metres and where it is. A table is a top (box 1.2 × 0.05 × 0.6 at height 0.72) and four legs (boxes 0.05 × 0.7 × 0.05 at the corners). Five to fifteen parts read well in this line-drawn look; more is rarely better.
- **Origin and front**: a floor object's origin is on the floor under its middle, a wall object's on the wall surface behind its middle, a ceiling object's on the ceiling above it. Everything faces **+Z**: that is the side a visitor stands on. Real sizes: a chair seat is 0.45 m high, a table 0.72 m, a door 2 m, a person 1.7 m.
- **Props**: what a scene may want to vary: sizes, a count, a part that can be left out. Three or four are plenty. Every prop needs a default and a `.describe('…')` line.
- **Clickable parts** (hotspots): names a scene can bind a click to, if any.
- **What moves**, if anything, and that it stops when the visitor asked for less motion.

## 3. Write the module

Read the file `prefab new` made, then replace its one box. The whole contract, with models, textures and screens, is `docs/guide/operator/extending/scene-prefabs.md`; this is what you need most of the time.

`meta({ z })` returns:

| Key | What |
| --- | --- |
| `schema` | `z.strictObject({ … })`, every prop with `.default(…)` and `.describe('…')` |
| `title`, `blurb`, `glyph` | its name, one line saying what it is, one or two characters for the editor's tree |
| `hotspots` | the clickable parts' names; a list, or `p => [...]` when they depend on props |
| `geometry` | `p => ({ min: [x, y, z], max: [x, y, z], mount })`: the box that holds every solid part **for every value of every prop**. Add `round: true` for a round footprint. Lines (cables, rays) stay out of it |
| `placement` | `p => ({ focus, cameraDistance, cameraHeight, markerOffset })`: where a stop's automatic camera looks, from how far and how high, and where the marker floats |

`component(sdk)` returns a function `({ props, active, hovered }) => element`. There is no JSX and there are no imports: take what you need from `sdk` and build elements with `h` (React's `createElement`).

```js
export function component({ h, Solid, Segs }) {
  return function SideTable({ props, hovered }) {
    const { width, depth, height } = props;
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    return h('group', null,
      h(Solid, { name: 'top', hotspot: 'top', args: [width, 0.05, depth], position: [0, height - 0.025, 0], line: hovered ? 'glow' : 'thick' }),
      ...legs.map(([sx, sz], i) => h(Solid, { key: i, name: `leg ${i + 1}`, args: [0.05, height - 0.05, 0.05], position: [sx * (width / 2 - 0.05), (height - 0.05) / 2, sz * (depth / 2 - 0.05)], line: 'mid' })),
    );
  };
}
```

| Building block | Props |
| --- | --- |
| `Solid` | `shape` (default `box`) and `args`, as below; `position: [x, y, z]`; `rotation: [x, y, z]` in **radians**; `fill`: `main`, `fine` (denser hatching, for small or secondary parts) or `false` (outline only); `line`: `thick`, `mid`, `thin`, `faint`, `glow` or `false`; `hotspot: 'name'`; `name` |
| `Segs` | loose lines: `points` is a flat list `[x, y, z, x, y, z, …]`, two points per segment; `line` as above (default `thin`) |
| `h('group', { position, rotation }, …)` | moves or turns several parts together |
| `ScreenSurface` | a screen plane: `w`, `h`, `position`, `id`, and a screen config (`source: 'text'`, `lines`, …; `node tools/scene.js keys screen`) |

| `shape` | `args` | Note |
| --- | --- | --- |
| `box` | `[width, height, depth]` | centred on its position |
| `cylinder` | `[topRadius, bottomRadius, height, sides]` | stands along y; different radii make a taper |
| `cone` | `[radius, height, sides]` | point up |
| `sphere` | `[radius, 12, 8]` | |
| `torus` | `[radius, tube, 8, 24]` | a ring standing in the x–y plane; turn it `[Math.PI / 2, 0, 0]` to lay it flat |
| `plane` | `[width, height]` | faces +z |
| `icosahedron`, `dodecahedron`, `octahedron`, `tetrahedron` | `[radius, 0]` | |

Rules the checks hold you to:

- **Name the parts** (`name: 'seat'`): the read-back and every finding call them by it.
- **Hooks at the top, never inside `if` or a loop**; `key` on every element made in a loop.
- **Motion**: move parts in `useFrame((state, dt) => …)` through a `useRef`, and return early when `reducedMotion` is true. `active` is true while the object's stop is shown: use it for a reveal (a lid that opens).
- **No materials of your own**: `Solid` and `Segs` take theirs from the scene's theme.
- **Nothing browser-only while rendering**: no `document`, no `window`.

## 4. Check until clean

```sh
node tools/scene.js prefab check <scene> <type>
```

It renders the type for its default props and then with each prop changed in turn (a low and a high number, the other side of a tick box, every choice), and reports, with the part and the props that show it: a part outside the declared box (`PREFAB_GEO_SMALL`: make `geometry` follow that prop), a floor object that floats (`PREFAB_MOUNT`), a hotspot that `meta` and the parts disagree on (`PREFAB_HOTSPOT`), something that moves under reduced motion (`PREFAB_MOTION`), a render that throws for some props (`PREFAB_THROWS`), a camera hint that would cut the object off (`PREFAB_PLACEMENT`, with a distance that works). Fix and rerun until it says `ok`.

## 5. Read it back against the parts list

```sh
node tools/scene.js prefab describe <scene> <type>
node tools/scene.js prefab describe <scene> <type> --props='{"width":2}'
```

It prints each part with its shape, size and centre, the measured size against the declared one, what is clickable and what moves, then the outline as text from the front, from the side and from above (`#` solid edges, `:` loose lines). Go through your list from step 2: every part is there, at the height and on the side you meant, and the three views look like the thing. A leg at `y -0.35` or a seat above its backrest shows here at once. Check a second set of props too: parts that should scale do, parts that should not stay.

## 6. Place it, or make the showroom

A type that is declared must be used somewhere, or the scene check warns (`PREFAB_UNUSED`).

- In an ordinary scene: place it like any object (`{ "type": "sideTable", "at": { … } }`), see the `build-scene` skill.
- For a pack: `node tools/scene.js showroom <scene>` lays the scene out as a gallery, one bay, stop, camera and page per type, and writes `prefabs/catalog.json` so the editor can offer the types. Run it again whenever a type is added or resized. Each type's page (`content/<type>.md`) is made from its meta and is yours to rewrite; it is kept once it exists.

```sh
node tools/scene.js check <scene> --strict     # the scene and every type in it
node tools/scene.js shots <scene>              # one picture: the whole room and each type from its stop
```

Read the picture. This is the first time the real renderer has drawn your type: look at whether it reads as the thing described, at its proportions next to its neighbours, and at parts that are lost against each other. Then go back to step 3 if it needs it.

## 7. Finish

- `make check` passes.
- Report: each type with its props and clickable parts, what the picture showed, and what was not looked at (motion, and how it reads up close) and needs a person at `http://localhost:5180/?scene=<scene>` (`make dev PORT=5180`).

## Things that go wrong

- **Rotation in degrees.** Inside a component `rotation` is radians (`Math.PI / 2` is a quarter turn). Degrees are for scene files only.
- **A box positioned by its corner.** Every shape is centred on its `position`: a 0.7 m leg standing on the floor has `y = 0.35`.
- **The box does not follow a prop.** `geometry` is a function of the props; if `width` changes the parts, it must change the box. The check finds it at the prop's other values.
- **Front and back swapped.** The front is +Z. A sofa's backrest is at negative z; a wall object grows from z 0 towards +z.
- **A part named in `hotspots` that nothing has**, or the other way round: both sides must list the same names.
- **Many small parts in a loop without `key`**: React warns, and the check passes the warning on (`PREFAB_REACT`).
- **It needs a model or a picture.** A `.glb` or texture shipped next to the module is loaded with `useModel(assetUrl('x.glb'))`; the checks cannot measure it, so declare `geometry` by hand. See "Assets" in `docs/guide/operator/extending/scene-prefabs.md`.
