# What is tested where

This page maps each area of the product to the check that covers it today and names the gap, so a reviewer knows what to look at by hand for a given change. "Explore" means the [exploratory checklist](../exploring/exploratory.md).

| Area | Code | Covered today by | Gap |
| --- | --- | --- | --- |
| Config schema and defaults | `src/config/schema.js`, `defaults.js` | `test/schema.test.js`, `test/deepMerge.test.js`: good and bad input, exact error lines | — |
| Scene building: merge, media URLs, auto-placement, errors | `src/config/buildScene.js` | `test/buildScene.test.js` (in-memory fixture: missing file, bad JSON, duplicate ids, unknown props, media resolution); `test/scenes.test.js` builds every shipped scene | — |
| Loader: scene choice, fetch, HTML fallback | `src/config/loadScene.js` | step 2 | the fetch glue itself (about 30 lines) has no test |
| Auto-placement | `src/lib/autoCamera.js` | `test/autoCamera.test.js`: position, rotation, scale, default height; every prefab's hints | — |
| Prefab metadata | `src/prefabs/*.meta.js`, `registry.js` | `test/registry.test.js`: defaults validate, unknown keys rejected, placement finite, media keys exist | — |
| Prefab geometry | `src/prefabs/*.jsx` | the prefabs used in the example scenes, by eye | `primitive` with every shape, prop edge cases (`count: 1`, `chair: false`, a `controlDesk` with 1 or 9 screens) |
| Block and screen schemas | `src/ui/blocks/schema.js`, `src/prefabs/screenSchema.js` | `test/blocks.test.js` | fenced blocks inside Markdown are validated only when rendered (step 3) |
| Screens | `src/prefabs/media.jsx`, `src/scene/screens.js` | images in `gallery`; every other source (`text`, all three `graph` styles, `stats`, own rain with colour, image, `terminal`, `dashboard`, `form`) on the `neo-room` control desk; pure drawing helpers (`keepTyped`, `valueRange`, `scaleSeries`, `graphReadout`, `statsGrid`, `isHls`) in `test/liveScreens.test.js` | **video is untested** by any example scene; HLS is checked by hand only (explore). Canvas drawing itself has no unit test. Unknown `source` fallback is untested |
| Live data: feeds, transforms, hub | `src/data/` (`feedSchema.js`, `hub.js`, `feeds.js`, `useFeed.js`, `live.js`), `src/config/origins.js` | `test/feedSchema.test.js` (schemas, block and screen feed rules); `test/feeds.test.js` (sharing, polling, abort, backoff, hidden tab, SSE, guard, `fetchJson`, `guardData`); `test/liveScreens.test.js` (`mergeLive`); `test/buildScene.test.js` (transform loading, unknown transform paths); `test/scenes.test.js` runs every shipped transform on its local data | the React hooks (`useFeed`, `useLiveScreen`) and `FeedBlock` are checked by hand (explore); a real cross-origin host and CORS failures only by hand |
| Screen zoom and overlays | `src/ui/ScreenOverlay.jsx`, `src/ui/screens/`, `src/scene/screenState.js` | explore ([Zoomed-in screens](../exploring/exploratory.md#zoomed-in-screens)); dashboard filtering in `test/dashboard.test.js` | overlay alignment under 760 px and on touch devices has not been checked; terminal command parsing has no unit test |
| Camera and transitions | `src/scene/CameraRig.jsx` | explore | everything; motion is checked only by eye |
| Input | `src/ui/useInput.js` | explore | everything |
| Panel and blocks | `src/ui/Panel.jsx`, `Markdown.jsx`, `blocks/` | step 3 | form `action` POST path |
| Labels, minimap, progress | `src/ui/Labels.jsx`, `Minimap.jsx`, `Overlays.jsx` | explore | alignment of labels with diamonds |
| Theme | `src/ui/theme.js`, `src/styles.css` | `gallery` (amber theme) | `scanlines`/`vignette` combinations, `fontsUrl: ""` |
| Responsive and reduced motion | CSS media queries, `src/lib/env.js` | explore | everything |
| Build and base path | `vite.config.js` | step 1 and step 4 | hosting under a real sub-path with a real web server; `VITE_SCENES_BASE` pointing at another origin |
| Easing, text, maths helpers | `src/lib/easing.js`, `text.js`, `math.js` | `test/easing.test.js`, `test/text.test.js`, `test/math.test.js` | — |
| Docs | `docs/guide/` | `mdbook build` | links from docs to code (paths, defaults) can drift silently |
