# Monitoring

This page says what you can observe about a deployed Scene Rooms site and how. The app is static and sends no telemetry, so monitoring means watching the web server and checking the page from outside.

> **Note.** This is a deliberate gap. Adding analytics or error reporting changes what leaves the visitor's browser; update the content guide's [privacy page](../../user/privacy.md) if you do.

## Signals

| Signal | Where | What it means |
| --- | --- | --- |
| 404s for `scenes/**/*.json` or `*.md` | web server access log | a scene lists a file that is not deployed; visitors see **Could not load the scene** |
| 404s for `scenes/**/media/*` | access log | missing image or video; that screen shows rain instead |
| `ConfigError: <file> › <path>: …` | browser console (`console.error` in `App.jsx`) | a config validation failure; the same lines are on screen |
| `Could not load image …` / `Could not load video …` | browser console (`console.warn`) | missing file, wrong content type or a CORS block on another host |
| WebGL context errors, **This browser cannot show the room** on screen | browser console | the device has no WebGL 2, or the GPU is blocklisted |
| requests to `fonts.googleapis.com` | browser network tab | expected with the default theme; absent with `fontsUrl: ""` |

## A synthetic check

A small external check catches most deploy mistakes. For each scene, fetch `scene.json`, every file in its `poi` list and every `content.markdown` path, and fail on non-200 responses or an `text/html` content type. For a full check, load `?scene=<name>` in a headless browser and fail if `#loader .err` appears. A headless browser needs a WebGL-capable (or SwiftShader) configuration.

## Performance

Frame cost scales with `effects.particles`, the number of fat-line outlines (every `Solid` has one) and the device pixel ratio, which is capped at 2. Lowering particles is the cheapest fix for every visitor at once.

Each visitor can also lower the cost on their own device in **Options → General** (render resolution, frame-rate limit, particles, antialiasing, GPU preference); see [Rendering preferences and telemetry](../internals/rendering.md#rendering-preferences-and-telemetry). When someone reports a slow room, ask them for the **Copy report** text from **Options → System**: it has the frame rate, CPU and GPU time per frame, draw calls, memory, the GPU model and the browser.
