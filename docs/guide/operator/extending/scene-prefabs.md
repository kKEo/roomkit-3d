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

Keep `meta` free of anything browser-only: the test suite imports every scene's prefab modules in Node and runs `meta()` to check the scene builds. `component` is never called there, but it must be exported: a module without it is refused on the loading screen (`… has no "component" export`), before anything renders.

### Versions

A module that lives outside the app (on your own host, shared between scenes) outlives the app's builds. The SDK therefore has a version, `sdk.version` in `meta()` (`SDK_VERSION` in `src/prefabs/metaSdk.js`, semver), and a module may say what it was written for in `requires`: `^1.0.0` (that major, at least that version), `>=1.2.0` (any later), `1.2.3` or `*`. An app whose SDK does not satisfy it refuses the module with one loading-screen line (`needs SDK ^2.0.0, this app has 1.4.0`) instead of failing at render time. The version moves by these rules:

- **minor**: a key added to either SDK object, or a new optional meta key;
- **major**: a key removed, renamed or changed in meaning.

What the SDK hands out is listed in the two tables below. Of those, treat `useStore` and `runtime` as the app's internals: they are passed through so a prefab can do what a built-in can, but their shape follows the app, not this version number. Everything else in the tables is covered by it.

## The SDK

`meta(sdk)` receives:

| Key | What it is |
| --- | --- |
| `version` | the SDK's version (semver), what `requires` is checked against |
| `z` | zod, for the props schema |
| `screenSchema`, `screenOrSource`, `SCREEN_SOURCES` | the screen config schemas, to give a prop a screen like `desk` does |
| `SHAPES` | the names `Solid` accepts as `shape` |
| `feedSchema` | the schema of a live `feed` (a URL or `{ url, refresh, stream, transform }`), to give a prop live data; a screen config from `screenSchema` already accepts one (see [Live data](live-data.md)) |

`component(sdk)` receives all of the above plus:

| Key | What it is |
| --- | --- |
| `React`, `h` | React and `React.createElement` |
| `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback` | the React hooks |
| `THREE` | three.js |
| `useFrame`, `useThree`, `useLoader` | React Three Fiber hooks: per-frame work, the renderer/camera, cached asset loading |
| `Solid`, `Segs`, `Outline`, `useGeometry`, `shapeArgs` | the building blocks from `src/scene/core.jsx`; `Solid` takes `hotspot="name"` |
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
