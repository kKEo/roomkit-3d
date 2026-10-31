# scene.json reference

This page lists every key of a scene's `scene.json`. Every key is optional except `poi`. What you give is deep-merged over the defaults: objects merge key by key, arrays replace.

## Top level

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | string | `"Scene Rooms"` | `document.title` |
| `brand` | string | `"Scene/Rooms"` | header logo; each `/` is drawn dimmed |
| `lang` | string | `"en"` | `<html lang>` |
| `room` | object | below | |
| `theme` | object | below | |
| `camera` | object | below | |
| `effects` | object | below | |
| `ui` | object | English strings | see [Interface strings](ui-strings.md) |
| `prefabs` | object | `{}` | the scene's own object types: type name → module path (relative to the scene folder) or URL; see [Scene-shipped prefabs](../extending/scene-prefabs.md) |
| `transforms` | object | `{}` | functions that turn live feed responses into screen fields or block data: name → module path (relative to the scene folder) or URL, with `#exportName` to pick an export (default `transform`); see [Live data](../extending/live-data.md) |
| `decor` | object[] | `[]` | non-interactive objects, same shape as [POI objects](poi-json.md) |
| `poi` | string[] | — | **required**; at least one path relative to the scene folder; the order is the navigation order. Number keys reach the first nine |

## room

The floor is at `y = 0`. By default the room is a `width` × `depth` box centred on the origin; give a `footprint` for any other outline.

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `width` | number > 0 | `30` | along x; ignored when `footprint` is given (then derived from it) |
| `height` | number > 0 | `9` | |
| `depth` | number > 0 | `30` | along z; ignored when `footprint` is given |
| `footprint` | `[x, z][]` (3 or more) | the `width` × `depth` rectangle | the floor outline as corners in order, either way round, without self-intersections. Walls, skirting and wall panels follow every edge; grids are clipped to it; the minimap draws it; the overview camera and flight arcs use its bounds and centroid. The `loft` example scene is an L |
| `grid.floor` | number ≥ 0 | `1.5` | floor grid spacing; `0` = none |
| `grid.ceiling` | number ≥ 0 | `3` | ceiling grid spacing; `0` = none |
| `wallPanels` | number ≥ 0 | `3` | spacing of vertical wall lines; `0` = none |
| `skirting` | number[] | `[0.35, 8.5]` | heights of horizontal wall lines |
| `pillars` | `[x, z][]` | `[]` | 1.1 m round pillars, floor to ceiling, also drawn on the minimap |
| `lights` | `[x, y, z][]` | `[[0, 8.4, 0]]` | at least one. They light the hatch shader. A light within 0.8 m of the ceiling is drawn as a flush panel, a lower one as a pendant. |

## theme

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `accent` | colour | `#00ff66` | lines, hatching, titles, buttons |
| `accentInk` | colour | `#001a0a` | text on accent buttons |
| `highlight` | colour | `#b8ffcc` | marker glow, rain captions, minimap camera |
| `background` | colour | `#000000` | clear colour, fog colour, rain fade |
| `text` | colour | `#bff7cf` | |
| `textDim` | colour | `#5fa877` | secondary text |
| `surface` | colour | `rgba(0,16,7,.74)` | panel background |
| `fog` | `[near, far]` | `[14, 46]` | metres from the camera |
| `fontsUrl` | string | Google Fonts URL for IBM Plex Mono and VT323 | stylesheet injected once; `""` = none |
| `fonts.display` | CSS font-family | `"VT323", "IBM Plex Mono", …` | titles, logo, numbers |
| `fonts.body` | CSS font-family | `"IBM Plex Mono", …` | everything else |
| `hatch.density` | number | `4.5` | lines per metre, main surfaces |
| `hatch.fineDensity` | number | `8` | small parts |
| `hatch.roomDensity` | number | `2.6` | room shell |
| `hatch.roomStrength` | number | `0.75` | room shell brightness |
| `scanlines` | boolean | `true` | CSS scanline overlay |
| `vignette` | boolean | `true` | CSS vignette overlay |
| `glyphs` | string | half-width katakana, digits, `<>/=+*#` | rain and heading-scramble characters |

Colours accept anything `THREE.Color` parses (hex, `rgb()`, CSS names), except `surface`, which goes straight to CSS and may use `rgba()`.

## camera

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `fov` | number | `55` | degrees, landscape viewports |
| `fovPortrait` | number | `68` | degrees, viewports taller than wide |
| `intro.position` | `[x, y, z]` | `[0, 6.5, 27]` | where the fly-in starts; outside the default room, so it flies through the wall |
| `intro.target` | `[x, y, z]` | `[0, 3, 0]` | where it looks at the start |
| `intro.duration` | number > 0 | `3200` | ms for the first flight |
| `overview.position` | `[x, y, z]` | computed | the whole-room view: where the app opens (with no `#poi` in the address), and where `0` and the logo go. Default `[0, height + 0.22·size, depth/2 + 0.28·size]`, with `size = max(width, depth)`: outside the front wall and above the ceiling, so the room shows like a model with the roof off |
| `overview.target` | `[x, y, z]` | computed | default `[0, 0, −0.06·depth]`; give both keys or neither |

## effects

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `ease` | `quint` \| `expo` \| `back` \| `sine` \| `linear` | `quint` | initial transition curve; visitors can change it in Options → Camera |
| `parallax` | number ≥ 0 | `0.8` | mouse parallax strength; forced to `0` with reduced motion |
| `warp` | number ≥ 0 | `12` | extra FOV in degrees mid-flight; forced to `0` with reduced motion |
| `particles` | integer ≥ 0 | `520` | falling dust points |
| `panelOffset` | number | `0.16` | fraction of the width the frame shifts left while the panel is open |
| `markers` | boolean | `true` | whether the floating diamonds are shown at start (toggle: `M`) |
