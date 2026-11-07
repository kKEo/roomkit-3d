# The editor and publishing

This page explains the second page of the build, `edit.html`, and the publish flow it supports: an author edits a scene in the browser with a live preview, downloads the folder, and the folder is placed next to the viewer for everyone else. The code is `src/editor/`.

## What it is

`edit.html` mounts the same `<Viewer>` as `index.html` (`src/App.jsx`), with a pane on the left holding the scene's files:

| Part | Code | Notes |
| --- | --- | --- |
| Files | `src/editor/bundle.js` | a `Map<path, text>` of `scene.json`, `poi/*.json` and `content/*.md`: the same shape `buildScene` reads through `readerFromMap`. `?scene=<name>` loads a published scene's text files into it; without it a one-POI template is used |
| Live preview | `src/editor/EditorApp.jsx` | 250 ms after the last keystroke the files go through `buildScene`, the same function the viewer uses. Success installs the scene with `setLoaded`, which keeps the visitor at the same POI; failure shows the `file › path: message` lines and marks the files in red, while the last good scene stays on screen |
| Templates | `src/editor/bundle.js` | **New point of interest** adds a POI file, its Markdown page and the `scene.json` entry; **Add to …** appends an object with every prop of the chosen prefab spelled out at its default (from the prefab's schema), to the selected POI or to `decor` |
| Import… | `src/editor/unzip.js`, `importZip` in `export.js` | a zip (stored or deflated entries, read with `DecompressionStream`, no dependency) holding a scene folder, a whole site (`scenes/index.json` names the scene) or a bare `scene.json`: the text files go into the Map, every other file under the folder is held in memory as bytes plus an object URL, and `resolveUrl` prefers those URLs over the published folder, so media and even prefab modules load from memory (`import()` of a `blob:` URL; its origin is the page's, so `guardOrigin` passes). Loose media files land under `media/` the same way |
| Export… | `src/editor/export.js`, `zip.js`, `tools/viewer-bundle.js` | two zips (stored, no compression): the **scene folder** (`<folder>/…`) or a **whole site** (the viewer's files, `scenes/index.json` naming this one scene, `scenes/<folder>/…`). Both hold the text files plus every file they refer to by a relative path (prefab and transform modules, media props, local feeds, fenced feed blocks) and every imported file, from memory first, else fetched from the published folder. The section also sets the scene's `camera.freeFly` and `camera.start` (a stop, or the pose of the preview's camera from `runtime.pose`), by rewriting `scene.json` |

A scene opened with `?scene=` resolves `media/…` against its published folder; a new scene's media paths resolve only once the files are imported or the folder is on a server. Files that cannot be found by reading the scene (assets a prefab module loads with `assetUrl()`, media a feed answers with) travel only when imported; otherwise they are added to the unzipped folder by hand. A module imported from memory resolves its own `assetUrl()` paths against a `blob:` URL, which fails: such a prefab needs its assets on a server.

The viewer's file list comes from `viewer.json`, which `tools/viewer-bundle.js` writes next to `index.html` at build time. In `vite dev` the same plugin serves `/__viewer/viewer.json` and `/__viewer/<file>` from a production build it makes on the first request (into `node_modules/.cache/roomkit/viewer`, redone when `src/`, `index.html`, `vite.config.js` or `package.json` is newer), so the export works from the dev server too; the first export takes a few seconds longer. A viewer built with `VITE_SCENES_BASE` reads scenes from that host and cannot be bundled with one: the editor says so and disables the button.

The viewer's fixed overlays move right by `--view-left` (set on `html.editing`), and they project through the canvas rectangle (`runtime.view`), which is why the room, labels and zoomed screens stay aligned beside the pane.

## Publishing a scene

1. In the editor, set the **folder** name (letters, digits, `-`, `_`), open **Export…** and click **Scene folder .zip**.
2. Unzip it. Add any file the editor listed in red (it could neither find it in memory nor fetch it) into the folder.
3. Put the folder in `scenes/` next to the deployed `index.html` (or in `public/scenes/` in the repository, so it ships with the next build and is covered by `make test`).
4. List it in `scenes/index.json` (the `scenes` array; `default` names the scene the bare URL opens).
5. Share `…/?scene=<folder>`. Deep links to a POI are `…/?scene=<folder>#<poi-id>`.

The published viewer is view-only by construction: it is the same `index.html` as before, and it reads the folder as data. No build is needed for new or changed scenes (see [Build and deploy](deploy.md)). To keep the editor off the public site, do not deploy `dist/edit.html` and `dist/assets/edit-*.js`.

## Exporting a site

The other route, for a scene that gets a host of its own: **Export…**, set *Allow free flight* and *opens at* (a stop, the whole room, or **Use current view** for the pose the preview's camera has now), then **Whole site .zip**. Unzip `<folder>-site.zip` onto any static host that follows the [hosting rules](deploy.md#hosting-rules); its `index.html` opens that scene. Links to other scenes (`openUrl` actions with `?scene=…`) have no target in such a site, and the fonts still come from Google unless the scene sets `theme.fontsUrl` to `""`.

## Limits of this first editor

- Text editing only: objects are placed by typing coordinates. A transform gizmo and a form inspector generated from the prefab schemas are the natural next steps; the schemas (`src/prefabs/*.meta.js`, `src/prefabs/screenSchema.js`, `src/ui/blocks/schema.js`) already carry every field, default and choice such an inspector needs.
- Media are imported into memory, not uploaded anywhere: they travel in the exported zip. The browser holds them, so a very large video makes the page heavy; the zip is built in memory too (no ZIP64, so under 4 GB).
- No server: the export is the hand-off. A hosted flow would `PUT` the same files to a bucket and append to `index.json`.
