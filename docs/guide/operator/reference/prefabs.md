# Prefab reference

This page lists every object type with its props, defaults, origin and the placement hints used when a POI has no `camera` or `marker`. The source is `src/prefabs/registry.js` (metadata) and `src/prefabs/<Name>.jsx` (geometry). Every prefab faces local **+Z**.

How to read the placement columns: `focus` is the local point the camera looks at. The camera stands `distance` metres in front of it along local +Z, at world height `cam y` (`—` means `focus.y + 0.3`). The marker hangs at the local point `marker`. `h`, `w` and `e` stand for the `height`, `width` and `elevation` props.

## Floor objects

### desk

A desk with monitor, keyboard and chair. Origin: floor centre. The seated user faces −Z; viewers stand on the +Z side.

| Prop | Default | Notes |
| --- | --- | --- |
| `screen` | `"rain"` | `"rain"`, `"image"` or `"video"` on the monitor |
| `src` | `null` | media file for `screen`; resolved against the scene folder |
| `chair` | `true` | |

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
