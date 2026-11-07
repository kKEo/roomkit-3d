# The editor and publishing

This page explains the second page of the build, `edit.html`, and the publish flow it supports: an author edits a scene in the browser with a live preview, downloads the folder, and the folder is placed next to the viewer for everyone else. The code is `src/editor/`.

## What it is

`edit.html` mounts the same `<Viewer>` as `index.html` (`src/App.jsx`), with a pane on the left holding the scene's files:

| Part | Code | Notes |
| --- | --- | --- |
| Files | `src/editor/bundle.js` | a `Map<path, text>` of `scene.json`, `poi/*.json` and `content/*.md`: the same shape `buildScene` reads through `readerFromMap`. `?scene=<name>` loads a published scene's text files into it; without it a one-POI template is used |
| Live preview | `src/editor/EditorApp.jsx` | 250 ms after the last keystroke the files go through `buildScene`, the same function the viewer uses. Success installs the scene with `setLoaded`, which keeps the visitor at the same POI; failure shows the `file › path: message` lines and marks the files in red, while the last good scene stays on screen |
| Templates | `src/editor/bundle.js` | **New point of interest** adds a POI file, its Markdown page and the `scene.json` entry; **Add to …** appends an object with every prop of the chosen prefab spelled out at its default (from the prefab's schema), to the selected POI or to `decor` |
| Download | `src/editor/zip.js` | a zip (stored, no compression) of the files under `<folder>/`, written without a dependency |
| Export… | `src/editor/export.js`, `tools/viewer-bundle.js` | a zip that is a whole site: the viewer's files, `scenes/index.json` naming this one scene, and `scenes/<folder>/` with the text files plus every file they refer to by a relative path (prefab and transform modules, media props, local feeds, fenced feed blocks), fetched from the published folder. The section also sets the scene's `camera.freeFly` and `camera.start` (a stop, or the pose of the preview's camera from `runtime.pose`), by rewriting `scene.json` |

Media files are not part of the **Download** bundle. A scene opened with `?scene=` keeps resolving `media/…` against its published folder; a new scene's media paths only resolve once the folder is on a server. **Export…** does fetch them, from that same folder; for a new scene they are listed as missing and have to be added to the unzipped `scenes/<folder>/` by hand, as do files that cannot be found by reading the scene (assets a prefab module loads with `assetUrl()`, media a feed answers with).

The viewer's file list comes from `viewer.json`, which `tools/viewer-bundle.js` writes next to `index.html` at build time. In `vite dev` the same plugin serves `/__viewer/viewer.json` and `/__viewer/<file>` from a production build it makes on the first request (into `node_modules/.cache/roomkit/viewer`, redone when `src/`, `index.html`, `vite.config.js` or `package.json` is newer), so the export works from the dev server too; the first export takes a few seconds longer. A viewer built with `VITE_SCENES_BASE` reads scenes from that host and cannot be bundled with one: the editor says so and disables the button.

The viewer's fixed overlays move right by `--view-left` (set on `html.editing`), and they project through the canvas rectangle (`runtime.view`), which is why the room, labels and zoomed screens stay aligned beside the pane.

## Publishing a scene

1. In the editor, set the **folder** name (letters, digits, `-`, `_`) and click **Download .zip**.
2. Unzip it. Add any media files the scene refers to into its `media/` folder.
3. Put the folder in `scenes/` next to the deployed `index.html` (or in `public/scenes/` in the repository, so it ships with the next build and is covered by `make test`).
4. List it in `scenes/index.json` (the `scenes` array; `default` names the scene the bare URL opens).
5. Share `…/?scene=<folder>`. Deep links to a POI are `…/?scene=<folder>#<poi-id>`.

The published viewer is view-only by construction: it is the same `index.html` as before, and it reads the folder as data. No build is needed for new or changed scenes (see [Build and deploy](deploy.md)). To keep the editor off the public site, do not deploy `dist/edit.html` and `dist/assets/edit-*.js`.

## Exporting a site

The other route, for a scene that gets a host of its own: **Export…**, set *Allow free flight* and *opens at* (a stop, the whole room, or **Use current view** for the pose the preview's camera has now), then **Export site .zip**. Unzip `<folder>-site.zip` onto any static host that follows the [hosting rules](deploy.md#hosting-rules); its `index.html` opens that scene. Links to other scenes (`openUrl` actions with `?scene=…`) have no target in such a site, and the fonts still come from Google unless the scene sets `theme.fontsUrl` to `""`.

## Limits of this first editor

- Text editing only: objects are placed by typing coordinates. A transform gizmo and a form inspector generated from the prefab schemas are the natural next steps; the schemas (`src/prefabs/*.meta.js`, `src/prefabs/screenSchema.js`, `src/ui/blocks/schema.js`) already carry every field, default and choice such an inspector needs.
- No media upload. Pictures and videos are referenced by path and added to the folder by hand.
- No server: the download is the hand-off. A hosted flow would `PUT` the same files to a bucket and append to `index.json`.
