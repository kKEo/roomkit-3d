# Rendering and the look

This page explains how the "scratchboard" look is produced and which knobs in `theme` drive it. The relevant code is `src/scene/materials/hatch.js`, `src/scene/core.jsx`, `src/scene/rain.js` and `src/main.jsx`.

## Colour handling

The look was tuned for raw, non-colour-managed output, as in three.js r147 where it was prototyped. So:

- `src/main.jsx` sets `THREE.ColorManagement.enabled = false`.
- `<Canvas flat linear>`: no tone mapping, linear output colour space.
- Image and video textures keep three's default `NoColorSpace`.

> **Warning.** Turning colour management back on makes every hex colour in `theme` come out darker, and the hatch shader would need `#include <colorspace_fragment>`. Change all three settings together or none.

## Rendering preferences and telemetry

**Options → General** stores the visitor's rendering preferences as `gfx` in the store and as JSON under `roomkit.gfx` in `localStorage` (`src/lib/gfx.js`). They belong to the device, not to a scene, so `setLoaded` never touches them; a stored value that is no longer a valid choice falls back to its default.

| Key | Values (default first) | Applied |
| --- | --- | --- |
| `dpr` | `auto`, `0.5`, `0.75`, `1`, `1.5`, `2` | the canvas `dpr` prop; `auto` is `[1, 2]`. Live |
| `fps` | `0` (no cap), `120`, `60`, `30` | a cap sets `frameloop="never"` and `FrameCap` (`src/scene/Telemetry.jsx`) calls `advance()` from its own `requestAnimationFrame` once a full interval has passed. R3F resets its clock on every frame-loop switch, so shader time jumps once when the cap changes. Live |
| `particles` | `1`, `0.5`, `0` | multiplies `effects.particles`. Live |
| `antialias` | `true`, `false` | WebGL context attribute: after a reload |
| `power` | `high-performance`, `default`, `low-power` | WebGL `powerPreference`: after a reload |
| `hud` | `false`, `true` | the performance overlay (`src/ui/PerfHud.jsx`) |

The `Viewer` reads `antialias` and `power` once, when it first creates the canvas, and records them in `runtime.glAttrs`; the General tab compares the stored values with those and offers a reload when they differ.

`Telemetry` (inside the canvas) puts the renderer in `runtime.gl`. While the System tab is open or the overlay is on, it also mounts `Probe`, which measures every frame and publishes `runtime.stats` every 250 ms:

| Figure | How it is measured |
| --- | --- |
| frame rate, frame time | timestamps of the last second of frames; the last 120 frame times feed the graphs |
| CPU per frame | from the first `useFrame` callback (priority −1000; negative priorities keep auto-rendering on) to the end of `gl.render`, which `Probe` wraps while mounted |
| main thread busy | CPU per frame × frames per second |
| GPU per frame | an `EXT_disjoint_timer_query_webgl2` query around `gl.render`, one at a time; disjoint results are dropped. Firefox and Safari don't expose the extension |
| long tasks | a `PerformanceObserver` for `longtask` entries in the last 10 s (Chromium only) |
| draw calls, triangles, points, lines, geometries, textures, programs | `gl.info` after each render |
| scene objects | `scene.traverse` at each publish |
| JS heap | `performance.memory` (Chromium only) |

The static rows of the System tab (GPU, limits, extensions, display, device) come from `src/lib/sysinfo.js`. The GPU name uses `WEBGL_debug_renderer_info` where the browser allows it; Firefox and Safari return a generic or rounded name.

## Surfaces: the hatch shader

Every solid surface uses a `ShaderMaterial` with one fragment shader. It computes simple diffuse light from the point lights in `room.lights` (compiled in as `NUM_LIGHTS`), then draws up to three layers of accent-coloured lines in world space. Diagonal lines appear above 10–20 % light, cross-hatching above 40–50 %, and dense horizontal lines above 68–78 %. So brighter surfaces get more ink. A slow horizontal "scan" band moves up the room. Fog is done in the shader from `theme.fog` (`[near, far]` in camera depth).

| Fill | Used for | Density |
| --- | --- | --- |
| `main` | most solids | `theme.hatch.density` (4.5) |
| `fine` | small or flat parts: frames, monitors, shelves | `theme.hatch.fineDensity` (8) |
| `room` | the room shell (the `footprint` polygon extruded to `height`, `src/scene/Room.jsx`), rendered from inside (`BackSide`) | `theme.hatch.roomDensity` (2.6) at `roomStrength` (0.75) |
| `hit` | invisible raycast targets | — |

The uniforms (`uColor`, `uLight`, `uTime`, fog) are shared objects, so one time update per frame (`Ticker` in `Experience.jsx`) animates every material.

## The room

`Room.jsx` builds the shell from `room.footprint` (a polygon of `[x, z]` corners; `src/lib/footprint.js` fills in the rectangle when a scene gives only `width` and `depth`) as a `THREE.Shape` extruded to `room.height`. Floor and ceiling grids are the grid lines clipped to the polygon (`gridSegments`), and wall panels and skirting are laid along every edge, inset 2 cm along the edge's inward normal. The minimap, the overview camera, the flight arcs, fog and the dust particles all read the same footprint, its `bounds` and `centre`, so a non-rectangular room needs no other change.

## Lines

`<Outline>` draws `EdgesGeometry` (edges sharper than 20° by default) on every `Solid`. Line styles:

| Name | Kind | Width / opacity |
| --- | --- | --- |
| `thick` | fat line (`LineSegments2`) | 2.4 px |
| `mid` | fat line | 1.6 px, 0.85, accent × 0.9 |
| `glow` | fat line, `theme.highlight` | 3 px |
| `thin` | `LineBasicMaterial` | 1 px, 0.55 |
| `faint` | `LineBasicMaterial` | 1 px, 0.16 |

Fat lines keep a constant pixel width. `LineSegments2.onBeforeRender` sets the material resolution from the viewport, so nothing has to be updated on resize.

## Screens and media

`createRain(theme)` draws Matrix rain on a 512 × 288 canvas every 55 ms. A boxed caption shows the current POI's `screenLabel` (or its lowercased `label`). One `CanvasTexture` is shared by every screen in the scene.

`ScreenSurface` (`src/prefabs/media.jsx`) is the one screen component every prefab uses. It picks its texture in this order:

1. an image or video texture once loaded (`source: "image" | "video"`);
2. a screen-owned canvas from `src/scene/screens.js`: `createTextScreen` (`"text"`), `createGraphScreen` (`"graph"`: wave, bars or radar, from `values`/`points` or demo data), `createStatsScreen` (`"stats"`), or `createOwnRain` (`"rain"` with a `label` or `color`). Each owns a 512 × 288 `CanvasTexture`, stepped about 20 times a second in `useFrame` and disposed on unmount;
3. otherwise the shared rain.

A drawer is created once per screen and source; new content (a live feed's answer, an edit in the editor) reaches it through `update(config, status)`, so the canvas is not recreated and its animation carries on. `status` (`"static"`, `"loading"`, `"ok"`, `"error"`) puts a mark in the title bar: a blinking `…` while loading, a `!` on failure. See [Live data](../extending/live-data.md).

The interactive sources draw a preview from their shared state: `createTerminalScreen` (log tail, prompt and the text being typed), `createDashboardScreen` (one bar per filtered row; active filters and `n/total` in the title bar) and `createFormScreen` (field boxes and the submit button, drawn once).

Canvas screens cost one texture upload per redraw, so a wall of six adds six small uploads about 20 times a second. That is fine on desktop GPUs; keep walls modest on low-end phones. Media are scaled to "cover" the plane. Videos are created muted, looping and inline with `crossOrigin = 'anonymous'`; an `.m3u8` source plays natively where the browser supports HLS, else through hls.js (`hls.js/light`, imported on demand). Images use three's `TextureLoader`, which defaults to `anonymous` too.

## The zoomed-in screen overlay

`ScreenOverlay` (`src/ui/ScreenOverlay.jsx`) renders while `zoom` is set. Every animation frame it projects the screen's four world corners through the camera and sets its `left`, `top`, `width` and `height` to their bounding box. Because the camera faces the screen along its normal, that box is the screen. It also sets `--su` (box height ÷ 26, at least 11 px) as the font size, so text scales with the screen. It fades in when `runtime.zoomReady` turns true and focuses the first input.

| `source` | Overlay component |
| --- | --- |
| `terminal` | `src/ui/screens/Terminal.jsx`: log, input, ↑/↓ history |
| `dashboard` | `src/ui/screens/Dashboard.jsx`: search, chip groups, table with value bars |
| `form` | the panel's `Form` block (`src/ui/blocks/index.jsx`) |
| anything else | no body, only the Back button over the close-up |

The overlay reads the screen's live config through the same feed as the screen (`useLiveScreen` in `src/data/live.js`), so a live dashboard's rows update while zoomed in; while the feed fails the title bar says `ui.feedStale`.

The overlay component and the canvas drawer share one plain object per screen (`getSession(key)` in `src/scene/screenState.js`). The component writes to it in effects; the drawer reads it on every redraw. That is why the 3D screen shows the filters and typed lines after the visitor steps back.

The DOM overlay is the reason this works: real inputs get focus, IME, autofill, scrolling and screen-reader support for free. Drawing widgets into the canvas and raycasting UVs would mean rebuilding all of that. The limit is that the overlay is flat and axis-aligned, so it only works for a head-on view; it is hidden during flights and the canvas preview shows instead.

## Overlays and effects

- Scanlines and vignette are a CSS overlay (`.fx`), switched by `theme.scanlines` and `theme.vignette`.
- `Particles` draws `effects.particles` falling points (220 at most with reduced motion, and frozen).
- Theme colours reach the DOM through CSS custom properties set by `applyTheme()`. `--line` is the accent at 28 % opacity and `--glow` a 14 px accent shadow.
