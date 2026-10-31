# Scene-shipped prefabs

A scene folder can bring its own object types. The viewer imports them at runtime, next to the scene's JSON and media, so a new kind of object needs **no rebuild and no redeploy of the app**. This page is the contract such a prefab follows; [Adding a prefab](prefab.md) is the other route, compiling one into the app.

The example shipped with the `loft` scene is `public/scenes/loft/prefabs/lamp.js`.

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

`meta` has the same shape as a built-in `<Name>.meta.js` (see [Adding a prefab](prefab.md#2-describe-its-props)): a strict zod schema where **every key has a default**, optional `media` and `hotspots`, and `placement`. The component receives `{ props, active, hovered }` like a built-in and returns a group in local space, facing +Z, in metres. Write elements with `h` (React's `createElement`): `h(Solid, { ...props }, ...children)`.

Keep `meta` free of anything browser-only: the test suite imports every scene's prefab modules in Node and runs `meta()` to check the scene builds. `component` is never called there.

## The SDK

`meta(sdk)` receives:

| Key | What it is |
| --- | --- |
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
- The browser caches a module by URL for the page's lifetime. The editor (`edit.html`) adds `?v=<n>` and offers **Reload prefabs** to import the scene's modules again after you change them; the viewer never does.
- The editor edits JSON and Markdown; prefab modules are written in your own editor and stay in the scene folder, referenced by URL like media. A new scene started in the editor has no folder yet, so a relative prefab path cannot be fetched until the scene is published.
- A prefab that throws while rendering, or whose `component` export is missing, logs one error and renders nothing; the rest of the room is unaffected.

## Where modules may come from

A scene prefab is JavaScript running with the page's privileges, so trust is scoped to where scenes already come from: by default only modules on the **page's origin or the scenes' origin** (`VITE_SCENES_BASE`) load; any other URL is a config error `prefabs.<type>: could not load …: blocked: <origin> is not an allowed prefab origin`. To allow more, set at build time:

```bash
VITE_PREFAB_ORIGINS=https://content.example.com,https://cdn.example.com npm run build   # or `*`
```

A cross-origin host must send `Access-Control-Allow-Origin` on the module and on every model or texture it fetches, serve `.js` as `text/javascript` (a SPA fallback that answers `index.html` breaks the import), and your Content-Security-Policy's `script-src` must include it. That CSP is the check the browser enforces; the app's own origin check is a convenience on top of it, so do send one (see [Deploying › Content-Security-Policy](../deploy/deploy.md#content-security-policy)). Anyone who can write to an allowed module origin can run code in your page.
