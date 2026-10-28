# What is tested where

This page maps each area of the product to the check that covers it today and names the gap, so a reviewer knows what to look at by hand for a given change. "Explore" means the [exploratory checklist](../exploring/exploratory.md).

| Area | Code | Covered today by | Gap |
| --- | --- | --- | --- |
| Config schema and defaults | `src/config/schema.js`, `defaults.js` | loading every scene (step 2) | nothing tests that **bad** config is rejected with the right message |
| Loader: fetch, merge, URLs, errors | `src/config/loadScene.js` | step 2 (happy path) | missing file, HTML fallback, duplicate ids and media URL resolution are untested |
| Auto-placement | `src/lib/autoCamera.js` | looking at POIs without `camera` (`neo-room` archive, all of `gallery`) | no numeric test of position and rotation maths |
| Prefabs | `src/prefabs/*.jsx` | the prefabs used in the example scenes, by eye | `primitive` with every shape, prop edge cases (`count: 1`, `chair: false`) |
| Media screens | `src/prefabs/media.jsx` | images in `gallery` | **video is untested**; no example scene uses one |
| Camera and transitions | `src/scene/CameraRig.jsx` | explore | everything; motion is checked only by eye |
| Input | `src/ui/useInput.js` | explore | everything |
| Panel and blocks | `src/ui/Panel.jsx`, `Markdown.jsx`, `blocks/` | step 3 | form `action` POST path |
| Labels, minimap, progress | `src/ui/Labels.jsx`, `Minimap.jsx`, `Overlays.jsx` | explore | alignment of labels with diamonds |
| Theme | `src/ui/theme.js`, `src/styles.css` | `gallery` (amber theme) | `scanlines`/`vignette` combinations, `fontsUrl: ""` |
| Responsive and reduced motion | CSS media queries, `src/lib/env.js` | explore | everything |
| Build and base path | `vite.config.js` | step 1 and step 4 | hosting under a real sub-path with a real web server |
| Docs | `docs/guide/` | `mdbook build` | links from docs to code (paths, defaults) can drift silently |
