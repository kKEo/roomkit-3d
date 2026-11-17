# Scene-shipped prefabs

A scene folder can bring its own object types. The viewer imports them at runtime, next to the scene's JSON and media, so a new kind of object needs **no rebuild and no redeploy of the app**. This page is the contract such a prefab follows; [Adding a prefab](prefab.md) is the other route, compiling one into the app.

The example shipped with the `loft` scene is `public/scenes/loft/prefabs/lamp.js`; the `cinema` scene ships two more, `prefabs/seats.js` (a row of seats, placed many times as `decor`) and `prefabs/projector.js` (an animated reel and a line-drawn light cone).

## Declaring one

In `scene.json`, map a type name to the module's path (relative to the scene folder) or URL:

```json
"prefabs": { "lamp": "prefabs/lamp.js", "kiosk": "https://content.example.com/prefabs/kiosk.js" }
```

- A type name is letters, digits and `_`, starting with a lowercase letter, and may not be a built-in type.
- Then place it like any object: `{ "type": "lamp", "position": [-10, 0, 10], "props": { "height": 2.2 } }`, in `decor` or in a POI. Its props, hotspots and auto-placement work exactly as for built-ins.
- Every problem with a prefab is a loading-screen line `<scene>/scene.json › prefabs.<type>: …` (the module cannot be fetched, has no `meta` export, its schema has no defaults, …). Objects of a type that failed to load are then reported as unknown types.

## The module

A scene prefab is a plain ES module with **no imports**. It must run as-is in the browser, so there is no build step, no JSX and no `import` of React or three.js: everything comes in through two factory functions that the viewer calls with an SDK object. That is what guarantees the prefab shares one React and one three.js with the app.

```js
/** Describes the props. Runs in the browser and in Node (the test suite), so no DOM or three.js here. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      height: z.number().positive().default(1.8),
      lit: z.boolean().default(true),
    }),
    media: [],                      // optional: props that hold a file path relative to the SCENE folder
    hotspots: ['shade'],            // optional: names a scene can bind actions to; a list or (props) => string[]
    placement: p => ({ focus: [0, p.height * 0.7, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
    // optional: the solid body's box, for scene checks and wall placement (mount: floor | wall | ceiling | free)
    geometry: p => ({ min: [-0.4, 0, -0.4], max: [0.4, p.height + 0.25, 0.4], mount: 'floor', round: true }),
    title: 'Floor lamp',            // optional: how the editor names the type (else the type name)
    blurb: 'a lamp on a pole',      // optional: one line under the name in the editor's Add palette
    glyph: '⚲',                     // optional: one or two characters for the editor's tree
    requires: '^1.0.0',             // optional: the SDK versions this module was written for (see below)
  };
}

/** Builds the component. Runs once, in the browser, before the scene first renders. */
export function component({ h, useRef, useFrame, Solid, reducedMotion }) {
  return function Lamp({ props, active, hovered }) {
    const shade = useRef();
    useFrame((_, dt) => { if (!reducedMotion && shade.current) shade.current.rotation.y += dt * 0.3; });
    return h('group', null,
      h(Solid, { shape: 'cylinder', args: [0.3, 0.35, 0.06, 16], position: [0, 0.03, 0] }),
      h(Solid, { shape: 'cylinder', args: [0.03, 0.03, props.height, 6], position: [0, props.height / 2, 0], line: 'mid' }),
      h(Solid, { ref: shade, hotspot: 'shade', shape: 'cone', args: [0.4, 0.5, 12, 1, true], position: [0, props.height, 0], fill: 'fine', line: hovered ? 'glow' : 'thick' }),
    );
  };
}
```

`meta` has the same shape as a built-in `<Name>.meta.js` (see [Adding a prefab](prefab.md#2-describe-its-props)): a strict zod schema where **every key has a default**, optional `media` and `hotspots`, and `placement`. The four presentation keys are for the editor and may be left out. The component receives `{ props, active, hovered }` like a built-in and returns a group in local space, facing +Z, in metres. Write elements with `h` (React's `createElement`): `h(Solid, { ...props }, ...children)`.

Keep `meta` free of anything browser-only: the scene tools and the test suite import every scene's prefab modules in Node and run `meta()` to check the scene builds. `component` must be exported too: a module without it is refused on the loading screen (`… has no "component" export`), before anything renders. It is also rendered in Node, without a browser, by the checks below, so keep anything that needs a page (`document`, `window`) out of the render and inside an event handler or an effect.

A prop's `.describe('…')` text is printed by `node tools/scene.js prefabs <scene>` next to its type and default, which is where an author (or a coding agent) reads what the prop does.

### Versions

A module that lives outside the app (on your own host, shared between scenes) outlives the app's builds. The SDK therefore has a version, `sdk.version` in `meta()` (`SDK_VERSION` in `src/prefabs/metaSdk.js`, semver), and a module may say what it was written for in `requires`: `^1.0.0` (that major, at least that version), `>=1.2.0` (any later), `1.2.3` or `*`. An app whose SDK does not satisfy it refuses the module with one loading-screen line (`needs SDK ^2.0.0, this app has 1.4.0`) instead of failing at render time. The version moves by these rules:

- **minor**: a key added to either SDK object, or a new optional meta key;
- **major**: a key removed, renamed or changed in meaning.

What the SDK hands out is listed in the two tables below. Of those, treat `useStore` and `runtime` as the app's internals: they are passed through so a prefab can do what a built-in can, but their shape follows the app, not this version number. Everything else in the tables is covered by it.

## Writing one, and checking it without a browser

Three commands make the loop, each well under a second:

```sh
node tools/scene.js prefab new loft sideTable --mount=floor --title="Side table"   # prefabs/sideTable.js, declared in scene.json
node tools/scene.js prefab check loft sideTable                                    # what is wrong with it
node tools/scene.js prefab describe loft sideTable                                 # what it makes
```

`prefab new` writes a module that is one box following three size props, for an object that stands on the `floor` (the default), hangs on a `wall` or from the `ceiling`, or is `free`. It passes the check as it stands; replace the box with the real parts.

`prefab check` renders the component with the real React and React Three Fiber reconciler on a canvas that draws nothing (`src/lint/stage.js`), for the default props and then with each prop changed in turn (a low and a high number, the other side of a tick box, every other choice), and compares what comes out with what the meta declares. `node tools/scene.js check <scene>` and the test suite run the same checks on every type a scene ships.

| Code | Level | Meaning |
| --- | --- | --- |
| `PREFAB_SOURCE` | error | the module has an `import` or a `require`; a page could not resolve it |
| `PREFAB_THROWS` | error | `component(sdk)` fails, the component throws while rendering for some props (a hook inside an `if` shows up here), a `useFrame` callback throws, or `geometry()`, `hotspots()` or `placement()` does |
| `PREFAB_ASSET` | error | a file named through `assetUrl` is not next to the module |
| `PREFAB_GEO_MISSING` | warn | the meta declares no `geometry`; the hint gives the measured box, ready to paste |
| `PREFAB_GEO_SMALL` | warn | a solid part reaches outside the declared box: at rest, for some value of a prop, or while it moves. The part and the props are named |
| `PREFAB_MOUNT` | warn | a `floor` object whose parts or box do not start at y 0, a `ceiling` object that does not end there, a `wall` object with parts behind z 0 |
| `PREFAB_HOTSPOT` | warn | `hotspots` lists a name no part has, or a part has a `hotspot` (a screen: an `id`) the list lacks |
| `PREFAB_MOTION` | warn | something still moves when `reducedMotion` is true |
| `PREFAB_MATERIAL` | warn | a part is drawn with a material that is not one of `useWorld().mats` |
| `PREFAB_PLACEMENT` | warn | a stop's automatic camera, placed by the meta's `placement`, would cut the object off or leave it under 1% of the picture; the hint gives a distance that works |
| `PREFAB_REACT` | warn | what React says while it renders, such as list items without a `key` |
| `PREFAB_UNUSED` | warn | (scene check only) the scene declares the type but places it nowhere |
| `PREFAB_GEO_LARGE` | info | the declared box is over 0.5 m and a quarter larger than the parts on one side |
| `PREFAB_UNMEASURED` | info | a glTF model or another loaded file is not loaded here, so its size is not measured |
| `PREFAB_UNTITLED` | info | the meta gives no `title`, `blurb` or `glyph` |

What is measured: every `Solid` (filled or outline only), every screen and any mesh of your own is the body; `Segs` and other lines (cables, beams, rays) are listed but left out, as they are left out of `geometry`. The declared box has to contain the body with 5 cm to spare; it may be more generous. On this stage a screen is a plain plane, a model is empty, and nothing is drawn: how it looks is for [the picture](../../tester/running/scene-checks.md) and the browser.

`prefab describe` reads one type back: what is declared, what is measured, each part with its shape, size and place (a part's `name` is what it is called here and in findings), what is clickable, what moves, and its outline from the front, the side and above. `--props='{"height":3}'` describes it with other props; `--svg=file.svg` writes the three views as a drawing, with the declared box dashed.

```text
lamp: "Floor lamp", a lamp on a pole whose shade turns
declared: a floor object, faces +z; 0.8 wide × 2.05 high × 0.8 deep (round): x -0.4…0.4, y 0…2.05, z -0.4…0.4
measured: its solid parts are 0.8 wide × 2.05 high × 0.8 deep: x -0.4…0.4, y 0…2.05, z -0.4…0.4; lines reach x -0.9…0.9, y 0…2.05, z -0.9…0.9
parts (3 solids, 1 line set):
   1  cylinder 0.7 × 0.06 × 0.7 at [0, 0.03, 0]
   3  cone 0.8 × 0.5 × 0.8 at [0, 1.8, 0]; fill fine, line mid, clickable as "shade", moves
```

## The SDK

`meta(sdk)` receives:

| Key | What it is |
| --- | --- |
| `version` | the SDK's version (semver), what `requires` is checked against |
| `z` | zod, for the props schema |
| `screenSchema`, `screenOrSource`, `SCREEN_SOURCES` | the screen config schemas, to give a prop a screen like `desk` does |
| `SHAPES` | the names `Solid` accepts as `shape` |
| `feedSchema` | the schema of a live `feed` (a URL or `{ url, refresh, stream, transform }`), to give a prop live data; a screen config from `screenSchema` already accepts one (see [Live data](live-data.md)) |

`component(sdk)` receives all of the above plus the keys below. Most come from `sdkCore` in `src/prefabs/sdkCore.js`, which needs no browser; `makeSdk` in `src/prefabs/sdk.js` adds the six a page alone can give (`ScreenSurface`, `reducedMotion`, `useLoader`, `useGLTF`, `useModel`, `useTexture`), and the checks above stand in for exactly those.

In full, `component(sdk)` gets:

| Key | What it is |
| --- | --- |
| `React`, `h` | React and `React.createElement` |
| `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback` | the React hooks |
| `THREE` | three.js |
| `useFrame`, `useThree`, `useLoader` | React Three Fiber hooks: per-frame work, the renderer/camera, cached asset loading |
| `Solid`, `Segs`, `Outline`, `useGeometry`, `shapeArgs` | the building blocks from `src/scene/core.js`; `Solid` takes `hotspot="name"` |
| `ScreenSurface` | a screen plane, every source included (`src/prefabs/media.jsx`) |
| `useWorld`, `useHotspot`, `useStore`, `runtime` | `{ mats, rain, room, theme }`, pointer handlers for a hotspot, the zustand store and the per-frame runtime |
| `reducedMotion`, `toRad`, `circlePts` | helpers the built-ins use |
| `moduleUrl`, `assetUrl(rel)` | the module's own URL and a path resolved against it (see below) |
| `useGLTF(url)`, `useModel(url)`, `useTexture(url)` | a glTF/GLB (cached, shared), a fresh copy of its scene for this instance, an image texture; all suspend while loading |
| `GLTFLoader`, `hatch(root, mats, { fill, line })` | the loader class, and a helper that gives an imported model the hatch fill and outlines |

Rules that keep the room consistent, same as for built-ins: respect `reducedMotion` for anything that moves on its own; use `active` for "reveal" animations; memoise what you derive from props; reuse `mats.fills` and `mats.lines` from `useWorld()` rather than creating materials, so the theme applies and nothing leaks.

## Assets: models and textures

Two roots exist, on purpose:

- **Scene media** (`media: ['image']` in `meta`): a prop holding a path the *content author* fills in, resolved against the scene folder like a picture frame's `image`. Use this for what varies per placement.
- **The prefab's own files**: a model or texture that belongs to the prefab itself, shipped next to the module. Resolve it with `assetUrl('lamp.glb')`, which is relative to the module's URL, so a prefab folder can be copied between scenes, or hosted once and shared.

```js
export function component({ h, useEffect, useModel, assetUrl, useWorld, hatch }) {
  return function Statue({ props }) {
    const model = useModel(assetUrl('statue.glb'));     // suspends until loaded; a placeholder shows meanwhile
    const { mats } = useWorld();
    useEffect(() => hatch(model, mats, { fill: 'main', line: 'thin' }), [model, mats]);
    return h('primitive', { object: model, scale: props.scale });
  };
}
```

`useGLTF` returns the loader's cached object, shared by every user of that URL, so do not mutate or dispose it; `useModel` gives a copy per component instance for that reason. `hatch` returns a function that removes what it added, which is why it is returned from the effect.

## Loading, caching and the editor

- The modules are imported while the loading screen is up, before the scene is validated: their schemas validate the objects. Their components are built before the first frame, along with the built-in prefab chunks the scene uses, so the intro flight shows no placeholders.
- The browser caches a module by URL for the page's lifetime. The editor (`edit.html`) adds `?v=<n>` and offers **Reload modules** to import the scene's modules again after you change them; the viewer never does. A module published at a fixed URL is also cached by the browser's HTTP cache and by any CDN in between, so a change may take a while to reach visitors. For a hosted module, put the version in the file name (`kiosk@1.2.0.js`) and serve it with a long `Cache-Control: immutable`; a scene then moves to the new version by changing its URL, and old scenes keep working. Dynamic `import()` has no integrity check, so a URL you do not control is a URL you trust.
- The editor edits JSON and Markdown; prefab modules are written in your own editor and stay in the scene folder or on your host, referenced by path or URL like media. The editor's **+ Add a type from the web…** writes the URL into `scene.json › prefabs` after importing the module once through `loadPrefab` (`src/config/buildScene.js`), so a module that would fail on the loading screen is refused in the dialog instead; a catalog (below) offers several at once. A new scene started in the editor has no folder yet, so a relative prefab path cannot be fetched until the scene is published; a module by URL works at once.
- A prefab that throws while rendering logs one error and renders nothing; the rest of the room is unaffected.

## Publishing a catalog

The editor adds a hosted prefab from its URL (**+ Add a type from the web…**), one at a time. To offer several at once, publish a **catalog** next to them: a JSON file whose URL ends in `.json`, which the editor shows as a pick list.

```json
{
  "roomkit": 1,
  "title": "Acme furniture",
  "prefabs": [
    { "type": "kiosk", "url": "kiosk@1.2.0.js", "title": "Kiosk", "blurb": "a touch kiosk on a pole", "glyph": "▮" },
    { "type": "plant", "url": "plant.js" }
  ]
}
```

- `roomkit` is the format version, `1`. `title` is optional.
- Each entry needs a `type` (the name the scene will use; the author can change it) and a `url`, resolved against the catalog's own URL, so the folder can be copied or mirrored whole. `title`, `blurb` and `glyph` are optional hints shown before the module is fetched; the module's own `meta` wins once it is checked.
- The catalog is data, fetched with CORS and without credentials (it follows `VITE_DATA_ORIGINS`); the modules it names follow the code origin rules below. Nothing is written into a scene until the author ticks entries, checks them and clicks **Add**.

The repository ships one for the samples: `public/scenes/loft/prefabs/catalog.json` lists the loft's lamp and the cinema's projector.

You need not write it by hand. `node tools/scene.js prefab catalog <scene>` writes `prefabs/catalog.json` from the scene's own types, taking each entry's `title`, `blurb` and `glyph` from the module's meta; run it again after changing them. It keeps the catalog's title and any entry that points outside the folder (another scene's module, a host's). The scene check reads the catalog too: one that the editor could not parse, or that names a module missing from the folder, is an error (`CATALOG`), and a type the scene ships that is not in it is a warning.

## A showroom for a set of types

A set of new types is easier to judge, and to hand to someone, as a room. `node tools/scene.js showroom <scene>` turns a scene into a gallery of its own types:

```sh
node tools/scene.js new furniture --title="Furniture"
node tools/scene.js prefab new furniture sofa
node tools/scene.js prefab new furniture wallLamp --mount=wall
# … write the modules, `prefab check` each …
node tools/scene.js showroom furniture
node tools/scene.js check furniture --strict
```

```text
furniture: a 12 × 12 m room, 7 m high, with 2 stops: sofa, wallLamp
wrote scene.json (room, lights, stop list), 2 stop files in poi/, 2 pages in content/ and prefabs/catalog.json
removed the untouched first stop of a new scene: poi/start.json, content/start.md
```

- Each type gets a bay along the north wall, sized from its `geometry`; past 48 m of bays a second row faces the first from the south wall. A floor type stands 0.6 m off the wall, a wall type hangs with its middle at eye height (or stands at floor level when its box starts there, like a door), a ceiling type hangs 2 m out, a free type floats at eye height.
- Each stop gets a camera in front of the type, far enough back to show all of it, and a marker above it. They are written out, not left to the type's `placement` hints, so a type whose hints are off is still shown properly (`prefab check` is what reports the hints).
- Each type gets a page, `content/<type>.md`, made from its meta: what it is, how big, a table of its props with their descriptions, its clickable parts. A page that already exists is kept, so you can rewrite them.
- In `scene.json` it sets the room's size and lights, the stop list and the intro camera, and leaves everything else (theme, title, scenery) as written. It also writes the catalog.

The command is safe to run again whenever a type is added or resized: the layout is worked out afresh, and what it writes passes `check --strict` as long as the scene has no scenery of its own in the way. The logic is `showroomFiles` in `src/lint/showroom.js`, pure, so it is tested without a file system (`test/showroom.test.js`).

## Where modules may come from

A scene prefab is JavaScript running with the page's privileges, so trust is scoped to where scenes already come from: by default only modules on the **page's origin or the scenes' origin** (`VITE_SCENES_BASE`) load; any other URL is a config error `prefabs.<type>: could not load …: blocked: <origin> is not an allowed prefab origin`. To allow more, the operator lists origins in one of two places; the lists add up:

```json
// scenes/index.json, read at runtime, no rebuild
{ "default": "cinema", "scenes": ["cinema"], "prefabOrigins": ["https://content.example.com", "https://cdn.example.com"] }
```

```bash
VITE_PREFAB_ORIGINS=https://content.example.com,https://cdn.example.com npm run build   # at build time; or `*`
```

Either may be `"*"` to allow any origin. The runtime list lives in `scenes/index.json` on purpose: that file is the operator's, like the app, and a scene's own files cannot widen it. An entry is an origin (scheme and host, a port if any); anything else in the list is ignored.

A cross-origin host must send `Access-Control-Allow-Origin` on the module and on every model or texture it fetches, serve `.js` as `text/javascript` (a SPA fallback that answers `index.html` breaks the import), and your Content-Security-Policy's `script-src` must include it. That CSP is the check the browser enforces; the app's own origin check is a convenience on top of it, so do send one (see [Deploying › Content-Security-Policy](../deploy/deploy.md#content-security-policy)). Anyone who can write to an allowed module origin can run code in your page.
