# Loading and validating config

This page follows a scene from its folder to the `scene` and `pois` objects the rest of the app uses. The code is in two files: `src/config/loadScene.js` chooses the scene and fetches files over HTTP; `src/config/buildScene.js` does everything else and is pure. It takes `{ name, read, resolveUrl }`, where `read(path)` returns a file's text and `resolveUrl(path)` turns a media path into a URL, so the same code runs in the browser, in the unit tests (reading `public/scenes/` from disk) and on an in-memory scene. Its rule is that every config mistake becomes a readable line on the loading screen, never a crash in the renderer.

## Choosing the scene

1. `?scene=<name>` in the URL wins.
2. Otherwise `scenes/index.json` is fetched and its `default` is used. The `scenes` list in that file is not read by the app; it is there for people.
3. The name must match `^[a-z0-9][a-z0-9-_]*$` (case-insensitive), or loading fails with `invalid scene name`.

The scenes base URL is `./scenes/` next to the page (it follows Vite's `base`), unless the build sets `VITE_SCENES_BASE`; see [Build and deploy](../deploy/deploy.md#serving-scenes-from-elsewhere).

## Scene file

`scene.json` is fetched, merged **over** `SCENE_DEFAULTS` with `deepMerge` (plain objects merge key by key; arrays and scalars replace), then validated with `sceneSchema`. Every section of the schema is strict: because the defaults supply every known key, a key the schema does not know can only be a typo, and it is reported (`scene.json › room: Unrecognized key: "hieght"`). The same holds for POI files, objects, props, screens and blocks. So a scene may give only `theme.accent` and keep every other theme key. It also means arrays such as `room.lights` or `room.pillars` replace the default list entirely.

`decor` objects are then normalised the same way as POI objects (below).

## POI files

All files in `scene.poi` are fetched in parallel with `Promise.allSettled`, so one broken file does not hide problems in the others. For each:

1. **Validate** with `poiSchema`. `objects[].position`, `rotation` and `scale` get defaults: `[0,0,0]`, `[0,0,0]`, `1`. Each object's `props` are validated with its prefab's schema from `src/prefabs/<Name>.meta.js`: defaults are filled in, a wrong type or an unknown key is an error under `objects.N.props.<key>`. Screens (`controlDesk.screens[]`, `desk.screen`) are validated with `screenSchema`, and `content.blocks` with the block schemas.
2. **Resolve media.** Props named in the prefab's `media` list (`image`, `src`, `screen.src`, `screens[].src`) are resolved against the scene folder unless they are absolute (`https:`, `data:`, a leading `/`).
3. **Place automatically** if `camera` or `marker` is missing: `autoPlacement()` in `src/lib/autoCamera.js` takes the first object's transform and its prefab's `placement(props)` hints. `focus` and `markerOffset` are in prefab-local space; the camera stands `cameraDistance` in front of `focus` along the object's local +Z (flattened to the floor plane), at height `cameraHeight` (or `focus.y + 0.3`).
4. **Load content.** `{ markdown: path }` is fetched and replaced by `{ blocks: [{ type: 'markdown', text }] }`, so the panel only ever deals with blocks.

After all POIs, duplicate `id`s are reported. If any step failed anywhere, a single `ConfigError` with every line is thrown.

## Errors

`parseOrThrow` turns each zod issue into `"<scene>/<file> › <path>: <message>"`. Fetch problems become `file not found` or `invalid JSON — <parser message>`.

> **Note.** The Vite dev server answers a missing file with `index.html` and status 200. `fetchFile` therefore treats any `text/html` response as "not found". In production this means your server must not serve `.json` or `.md` files as `text/html`.

What is **not** checked at load time:

- Fenced blocks inside Markdown (```` ```stats ````) are parsed and validated only when that panel renders; a problem shows as a red box in the panel. Blocks given directly in `content.blocks` are validated at load time.
- Media files are not fetched until their object renders; a missing image only logs `Could not load image …`.
- Dashboard `rows` are free-form records; `columns`, `filters` and `value` are not checked against them.
