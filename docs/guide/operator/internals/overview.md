# Architecture overview

This page maps the source tree to the runtime data flow, so you know which file to open for any change. Scene Rooms has no backend: everything below runs in the browser.

![Data flow: files in public/scenes are fetched and validated by config/loadScene.js, stored in the zustand store in state/store.js, and read by two renderers, the React Three Fiber canvas (room, prefabs, markers, camera rig) and the DOM overlays (header, panel, labels, minimap); user input from ui/useInput.js calls goTo() on the store, and the camera rig publishes the camera through runtime for the overlays.](../images/data-flow.svg)

## Start-up sequence

1. `src/main.jsx` turns off three.js colour management (see [Rendering](rendering.md)) and mounts `<App>`.
2. `src/App.jsx` calls `loadScene()`. On success it applies the theme (`src/ui/theme.js`) and puts `scene` and `pois` in the store. On failure it stores the `ConfigError`, and the loader shows its lines.
3. With the status `ready`, `App` mounts the `<Canvas>` with `<Experience>` and the DOM overlays.
4. After 650 ms (100 ms with reduced motion) it hides the loader and calls `goTo(<hash POI or −1>, camera.intro.duration)`, which flies the camera in from `camera.intro.position`, either to that POI or, with no hash, to the whole-room view (`camera.overview`).

## Source map

| Path | Responsibility |
| --- | --- |
| `src/config/defaults.js` | Every default for `scene.json`, including the English interface strings, and `deepMerge`. |
| `src/config/schema.js` | zod schemas for scenes and POIs; `parseOrThrow` builds `file › path: message` errors. |
| `src/config/loadScene.js` | Fetches and normalises a scene; collects every error before failing. |
| `src/prefabs/registry.js` | Prefab metadata: default props, media props, placement hints. No React, so the schema can import it. |
| `src/prefabs/index.jsx` | Maps `type` to component; `PlacedObject` applies position, rotation (degrees) and scale. |
| `src/prefabs/*.jsx` | One component per prefab, built from `Solid` and `Segs`. |
| `src/scene/core.jsx` | `WorldContext` (`mats`, `rain`, `room`, `theme`), `Solid`, `Outline`, `Segs`, geometry helpers. |
| `src/scene/Experience.jsx` | Everything inside the canvas; builds materials and the rain texture per scene. |
| `src/scene/CameraRig.jsx` | Camera transitions, parallax, FOV warp, roll and the panel view offset. |
| `src/scene/Markers.jsx` | The clickable diamonds (octahedron, ring and an invisible hit sphere). |
| `src/scene/Room.jsx`, `Particles.jsx`, `rain.js`, `materials/hatch.js` | Room shell, dust, the Matrix-rain texture, shaders and line materials. |
| `src/state/store.js` | The zustand store, plus `runtime`, a plain object for per-frame values. |
| `src/ui/*` | DOM overlays: header, panel, Markdown and blocks, labels, minimap, settings, progress bar, input. |

## State: store versus runtime

Two kinds of state are kept apart on purpose:

- **The zustand store** (`useStore`) holds what React renders: `scene`, `pois`, `current` (where the camera is or is going), `shown` (whose panel is open), `hover`, `panelCollapsed`, `markersVisible`, `settingsOpen`, `settings` and `nav`. Components subscribe with narrow selectors, such as `useStore(s => s.shown === index)`, so a navigation re-renders only what changes.
- **`runtime`** holds values that change every frame: the target and smoothed mouse position, the camera object, its position and direction, the transition progress, and the clock. Writing these to the store would re-render React 60 times a second. The canvas writes them in `useFrame`. The DOM overlays (labels, minimap, progress bar, panel parallax) read them in their own `requestAnimationFrame` loops.

`goTo(i)` is the single entry point for navigation. It sets `current`, hides the panel (`shown = -1`), bumps `nav.nonce` and rewrites the URL hash. `CameraRig` reacts to `nav` and calls `showPanel(i)` when the flight is 80 % done.
