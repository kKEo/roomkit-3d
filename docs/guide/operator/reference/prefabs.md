# Prefab reference

This page lists every object type with its props, defaults, origin and the placement hints used when a POI has no `camera` or `marker`. The source is `src/prefabs/registry.js` (metadata) and `src/prefabs/<Name>.jsx` (geometry). Every prefab faces local **+Z**.

How to read the placement columns: `focus` is the local point the camera looks at. The camera stands `distance` metres in front of it along local +Z, at world height `cam y` (`—` means `focus.y + 0.3`). The marker hangs at the local point `marker`. `h`, `w` and `e` stand for the `height`, `width` and `elevation` props.

## Floor objects

### desk

A desk with monitor, keyboard and chair. Origin: floor centre. The seated user faces −Z; viewers stand on the +Z side.

| Prop | Default | Notes |
| --- | --- | --- |
| `screen` | `"rain"` | `"rain"`, `"image"` or `"video"` on the monitor (for `text` and `graph` screens use `controlDesk`) |
| `src` | `null` | media file for `screen`; resolved against the scene folder |
| `chair` | `true` | |
| `zoom` | `true` | `false` makes the monitor not clickable (see [Zoomable screens](#zoomable-screens)) |

Placement: focus `[0, 1.6, 0]`, distance `6`, cam y `2.9`, marker `[0, 2.8, 0]`.

### wardrobe

Two-door wardrobe with shelf, boxes, rod and garments. Origin: floor centre. Doors open while its POI's panel is shown.

| Prop | Default | Notes |
| --- | --- | --- |
| `width` | `2.4` | |
| `height` | `4.2` | |
| `depth` | `1.2` | |
| `openOnFocus` | `true` | `false` keeps the doors shut |
| `openAngle` | `105` | degrees |

Placement: focus `[0, h × 0.5, 0]`, distance `max(6, h × 1.9)`, cam y `h × 0.58`, marker `[0, h + 0.7, 0]`.

### pedestal

Plinth with a floating, rotating solid and orbit rings. Origin: floor centre.

| Prop | Default | Notes |
| --- | --- | --- |
| `shape` | `"icosahedron"` | any shape from `primitive` |
| `height` | `3` | height of the floating solid's centre |
| `size` | `1.2` | radius of the solid; also scales the rings |
| `rings` | `true` | |

Placement: focus `[0, h − 0.1, 0]`, distance `12.5`, cam y `3.4`, marker `[0, h + 1.9, 0]`.

### controlDesk

A curved control-centre console made of desk segments on an arc, with sloped panels of blinking buttons, keyboards and knobs, operator chairs inside the curve, and a wall of screens on posts behind it. Origin: **floor at the middle of the desk**; operators sit on the +Z side, and the arc's centre is at local `[0, 0, radius]`.

| Prop | Default | Notes |
| --- | --- | --- |
| `radius` | `4` | arc radius of the desk |
| `arc` | `70` | degrees the desk spans |
| `segments` | `3` | desk segments; each gets its own console |
| `chairs` | `2` | chairs, spaced evenly around the middle of the arc |
| `screens` | six `{}` | one entry per screen, filled **left to right, top row first**; see below |
| `columns` | `3` | screens per row; rows = `ceil(screens / columns)` |
| `screenWidth` | `1.6` | every screen |
| `screenHeight` | `0.95` | every screen; the bottom row starts at 1.65 m |

Each entry of `screens` configures that screen alone:

| Key | Used by | Notes |
| --- | --- | --- |
| `source` | all | `"rain"` (default), `"image"`, `"video"`, `"text"`, `"graph"`, or the interactive `"terminal"`, `"dashboard"`, `"form"`; anything else falls back to rain with a console warning |
| `src` | `image`, `video` | file path, resolved against the scene folder |
| `label` | `rain` | caption in the middle of this screen's **own** rain; without `label` and `color` the screen shows the shared rain with the POI's `screenLabel` |
| `title` | `text`, `graph` | text in the title bar |
| `lines` | `text` | array of strings, typed out at about 45 characters per second, then repeated after 5 s (shown at once with reduced motion); about 7 lines fit |
| `graph` | `graph` | `"wave"` (scrolling signal, default), `"bars"` (16 live levels) or `"radar"` (sweep with fading contacts); the title bar shows a live readout |
| `color` | all canvas-drawn sources | CSS colour for this screen only (and its zoomed-in overlay); default `theme.accent` |
| `prompt` | `terminal` | text before the input, default `"> "` |
| `lines` | `terminal` | banner shown until the first command |
| `commands` | `terminal` | `{ "name": "one line" \| ["several", "lines"] }`; names are matched lower-case. Built in: `help`, `clear`, `goto <n\|id>`, `exit` |
| `rows` | `dashboard` | array of flat records |
| `columns` | `dashboard` | fields to show, in order; default the keys of the first row |
| `filters` | `dashboard` | fields that get a chip group (All + each distinct value) |
| `value` | `dashboard` | numeric field drawn as a bar, scaled to the largest value in `rows` |
| `form` | `form` | `{ fields, submit, action }`, the same shape as the panel's `form` block |
| `zoom` | all | `false` makes this screen not clickable |

```json
"screens": [
  { "source": "graph", "graph": "wave", "title": "NETWORK" },
  { "source": "text", "title": "STATUS", "lines": ["> core ..... OK", "> uplink ... OK"] },
  { "source": "graph", "graph": "radar", "title": "PERIMETER" },
  { "source": "image", "src": "media/floorplan.svg" },
  { "source": "rain", "label": "uplink // secure", "color": "#b8ffcc" },
  { "source": "graph", "graph": "bars", "title": "LOAD", "color": "#ffb000" }
]
```

Placement (`top` = upper edge of the screen wall): focus `[0, (1.65 + top) / 2, −0.85]`, distance `9.5`, cam y `3.2`, marker `[0, top + 0.55, −0.85]`. Leave about `radius + 1` metres behind the origin for the screens and posts, and about `radius` metres in front for the chairs.

#### Zoomable screens

Every `ScreenSurface` inside a POI's objects is clickable unless its `zoom` is `false`. Screens in `decor` are not: `PoiObjects` (`src/scene/Experience.jsx`) provides the POI index through `PoiContext`, and decor has none. The first click on a screen of another POI calls `goTo` for that POI; a click on a screen of the current POI zooms into it (see [Navigation and the camera](../internals/camera.md#zooming-into-a-screen)).

The interactive sources keep their state per screen (`src/scene/screenState.js`), keyed by the POI index and the screen's `id` (the control desk passes `scr0`, `scr1`, …). The state lives until the page reloads; it is not saved anywhere.

### serverRack

A row of 1.05 m cabinets with blinking LEDs, a cable tray and cables to the ceiling. Origin: floor centre of the row.

| Prop | Default | Notes |
| --- | --- | --- |
| `count` | `4` | cabinets, 1.1 m apart along x |
| `height` | `5.2` | |
| `cables` | `true` | tray and cables |
| `ceiling` | `null` | where the cables end; `null` = `room.height` |

Placement: focus `[0, 2.8, 0]`, distance `9.2`, cam y `3.1`, marker `[0, h + 0.7, 1.4]`.

### bench

A plain block. Origin: floor centre.

| Prop | Default |
| --- | --- |
| `width` | `5.6` |
| `height` | `0.7` |
| `depth` | `0.9` |

Placement: focus `[0, h, 0]`, distance `5`, cam y `2.5`, marker `[0, h + 1.2, 0]`.

## Wall objects

### pictureFrame

A frame, 0.14 m deep, with an inner mat, a caption and optional image and exhibit. Origin: **wall surface at the frame's centre**.

| Prop | Default | Notes |
| --- | --- | --- |
| `width` | `2.9` | |
| `height` | `2.1` | |
| `image` | `null` | shown inside the mat, cropped to cover |
| `exhibit` | `null` | a shape floating and rotating 1.3 m in front of the frame |
| `caption` | `true` | two short "text" lines under the frame |
| `zoom` | `true` | `false` makes the image not clickable |

Placement: focus `[0, 0, 1.3]`, distance `7`, cam y `—`, marker `[0, h/2 + 0.7, 0.6]`.

### cinemaScreen

A screen in a frame, with an optional stage and speakers. Origin: **wall surface at floor level**.

| Prop | Default | Notes |
| --- | --- | --- |
| `width` | `10` | screen width; the frame adds 0.5 |
| `height` | `5.6` | |
| `elevation` | `4.3` | height of the screen's centre |
| `source` | `"rain"` | `"rain"`, `"image"` or `"video"` |
| `src` | `null` | media file for `source` |
| `zoom` | `true` | `false` makes the screen not clickable |
| `stage` | `true` | 2.6 m deep floor stage |
| `speakers` | `true` | at `±(w/2 + 1.4)` |

Placement: focus `[0, e − 0.2, 0]`, distance `12`, cam y `3.4`, marker `[0, e + h/2 + 0.65, 0.8]`.

### door

A door frame with a swing arc on the floor. Decoration. Origin: wall surface at floor level.

| Prop | Default |
| --- | --- |
| `width` | `2.4` |
| `height` | `4.2` |

Placement: focus `[0, h/2, 0]`, distance `7`, cam y `3`, marker `[0, h + 0.6, 0.3]`.

## Generic

### primitive

One shape. Origin: the shape's centre.

| Prop | Default | Notes |
| --- | --- | --- |
| `shape` | `"box"` | `box`, `sphere`, `cylinder`, `cone`, `torus`, `torusKnot`, `icosahedron`, `dodecahedron`, `octahedron`, `tetrahedron`, `plane` |
| `size` | `null` | approximate bounding size; when set, `args` is derived from it (`shapeArgs()` in `src/scene/core.jsx`) |
| `args` | `[1, 1, 1]` | raw three.js geometry constructor arguments, used when `size` is `null` |
| `fill` | `"main"` | `"main"`, `"fine"` or `false` (outline only) |
| `edge` | `"thick"` | `"thick"`, `"mid"`, `"thin"`, `"faint"`, `"glow"` or `false` |
| `spin` | `0` | rad/s around y |
| `float` | `0` | bob amplitude in metres |

Placement: focus `[0, 0, 0]`, distance `6`, cam y `—`, marker `[0, 1.4, 0]`.
