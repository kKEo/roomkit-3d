# Rendering and the look

This page explains how the "scratchboard" look is produced and which knobs in `theme` drive it. The relevant code is `src/scene/materials/hatch.js`, `src/scene/core.jsx`, `src/scene/rain.js` and `src/main.jsx`.

## Colour handling

The look was tuned for raw, non-colour-managed output, as in three.js r147 where it was prototyped. So:

- `src/main.jsx` sets `THREE.ColorManagement.enabled = false`.
- `<Canvas flat linear>`: no tone mapping, linear output colour space.
- Image and video textures keep three's default `NoColorSpace`.

> **Warning.** Turning colour management back on makes every hex colour in `theme` come out darker, and the hatch shader would need `#include <colorspace_fragment>`. Change all three settings together or none.

## Surfaces: the hatch shader

Every solid surface uses a `ShaderMaterial` with one fragment shader. It computes simple diffuse light from the point lights in `room.lights` (compiled in as `NUM_LIGHTS`), then draws up to three layers of accent-coloured lines in world space. Diagonal lines appear above 10–20 % light, cross-hatching above 40–50 %, and dense horizontal lines above 68–78 %. So brighter surfaces get more ink. A slow horizontal "scan" band moves up the room. Fog is done in the shader from `theme.fog` (`[near, far]` in camera depth).

| Fill | Used for | Density |
| --- | --- | --- |
| `main` | most solids | `theme.hatch.density` (4.5) |
| `fine` | small or flat parts: frames, monitors, shelves | `theme.hatch.fineDensity` (8) |
| `room` | the room box, rendered from inside (`BackSide`) | `theme.hatch.roomDensity` (2.6) at `roomStrength` (0.75) |
| `hit` | invisible raycast targets | — |

The uniforms (`uColor`, `uLight`, `uTime`, fog) are shared objects, so one time update per frame (`Ticker` in `Experience.jsx`) animates every material.

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

`createRain(theme)` draws Matrix rain on a 512 × 288 canvas every 55 ms. A boxed caption shows the current POI's `screenLabel` (or its lowercased `label`). One `CanvasTexture` is shared by every screen in the scene. `ScreenSurface` (`src/prefabs/media.jsx`) shows that texture, or an image or video texture once it has loaded. Media are scaled to "cover" the plane. Videos are created muted, looping and inline with `crossOrigin = 'anonymous'`; images use three's `TextureLoader`, which defaults to `anonymous` too.

## Overlays and effects

- Scanlines and vignette are a CSS overlay (`.fx`), switched by `theme.scanlines` and `theme.vignette`.
- `Particles` draws `effects.particles` falling points (220 at most with reduced motion, and frozen).
- Theme colours reach the DOM through CSS custom properties set by `applyTheme()`. `--line` is the accent at 28 % opacity and `--glow` a 14 px accent shadow.
