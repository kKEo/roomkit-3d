# Loading and validating config

This page follows a scene from its folder to the `scene` and `pois` objects the rest of the app uses. The code is in two files: `src/config/loadScene.js` chooses the scene and fetches files over HTTP; `src/config/buildScene.js` does everything else and is pure. It takes `{ name, read, resolveUrl, loadModule }`, where `read(path)` returns a file's text, `resolveUrl(path)` turns a media path into a URL and `loadModule(url)` imports an ES module (a scene's own prefab), so the same code runs in the browser, in the unit tests (reading `public/scenes/` from disk) and on an in-memory scene. Its rule is that every config mistake becomes a readable line on the loading screen, never a crash in the renderer.

## Choosing the scene

1. `?scene=<name>` in the URL wins.
2. Otherwise `scenes/index.json` is fetched and its `default` is used. The `scenes` list in that file is not read by the app; it is there for people.
3. The name must match `^[a-z0-9][a-z0-9-_]*$` (case-insensitive), or loading fails with `invalid scene name`.

The scenes base URL is `./scenes/` next to the page (it follows Vite's `base`), unless the build sets `VITE_SCENES_BASE`; see [Build and deploy](../deploy/deploy.md#serving-scenes-from-elsewhere).

## Scene prefabs and transforms

Before anything is validated, `scene.json › prefabs` (type → module path or URL) is read from the raw file and each module is imported with `loadModule` (`import()` in the browser, behind the origin check in `loadScene.js`; a file import in the tests). Its `meta(META_SDK)` is called and the result normalised like a built-in's (`normalisePrefab` in `src/prefabs/registry.js`). The built-ins plus these form the scene's **registry** (`createRegistry`), and `makeSchemas(registry)` in `src/config/schema.js` produces the object, POI and scene schemas that know these types; a registry is made per build, so two scenes may use the same custom type name. Each failure (a type name that is invalid or built-in, a module that does not load or has no `meta`, a schema without defaults) is a line `scene.json › prefabs.<type>: …`; objects of that type then fail as unknown types. The result's `scene` carries `registry` and `prefabs` (type → resolved URL) for the renderer and the editor. See [Scene-shipped prefabs](../extending/scene-prefabs.md).

`scene.json › transforms` (name → module path or URL, `#export` optional) is loaded the same way and at the same time, by the same `loadDeclared` helper: each becomes `{ url, fn }` in `scene.transforms`. Failures are lines `scene.json › transforms.<name>: …`. After validation, `checkFeeds` walks the decor, every POI's objects and its `content.blocks` for feed configs (they carry a tag from `feedSchema`, so a scene prefab's own props count too) and reports a `transform` the scene does not declare. The built scene also carries `resolveUrl`, which feeds use at runtime to resolve their relative URLs. See [Live data](../extending/live-data.md).

`prefabs` and `transforms` are the two keys whose default (`{}`) comes from the schema rather than from `SCENE_DEFAULTS`.

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

## Prefab code

Once the scene is built, `loadScene` awaits `preloadPrefabs` (`src/prefabs/preload.js`): the chunk of every built-in prefab the scene places (`src/prefabs/loaders.js`, one chunk per prefab module) and, if the scene has its own prefabs, the SDK chunk they render through. The loading screen stays up meanwhile, so no placeholder is visible during the intro flight. A chunk that fails does not stop loading: that object renders nothing and logs once.

## Errors

`parseOrThrow` turns each zod issue into `"<scene>/<file> › <path>: <message>"`. Fetch problems become `file not found` or `invalid JSON — <parser message>`.

> **Note.** The Vite dev server answers a missing file with `index.html` and status 200. `fetchFile` therefore treats any `text/html` response as "not found". In production this means your server must not serve `.json` or `.md` files as `text/html`.

What is **not** checked at load time:

- Fenced blocks inside Markdown (```` ```stats ````) are parsed and validated only when that panel renders; a problem shows as a red box in the panel. Blocks given directly in `content.blocks` are validated at load time.
- Media files are not fetched until their object renders; a missing image only logs `Could not load image …`.
- Dashboard `rows` are free-form records; `columns`, `filters` and `value` are not checked against them.
