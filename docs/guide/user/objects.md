# Choosing objects

This page describes each kind of object you can put in a room, with the settings you are most likely to change. You choose the kind with `"type"` and change its settings in `"props"`. The [Prefab reference](../operator/reference/prefabs.md) in the Operator guide lists every setting with its default.

```json
{ "type": "wardrobe", "position": [-14.4, 0, -10], "rotation": [0, 90, 0], "props": { "height": 3.5 } }
```

Leave out `"props"` to use the defaults. Sizes are in metres.

## Things that stand on the floor

Put these at height `0`.

| Type | What it is | Settings worth knowing |
| --- | --- | --- |
| `desk` | A desk with a monitor, keyboard and chair. Visitors look at it from the chair side. | `screen`: `"rain"` (default), `"image"` or `"video"`, with `src` for the file. `chair`: `false` to remove it. |
| `wardrobe` | A two-door wardrobe with clothes and boxes inside. Its doors swing open while its panel is shown. | `width`, `height`, `depth`. `openOnFocus`: `false` keeps it shut. |
| `pedestal` | A low stand with a slowly turning shape floating above it, wrapped in rings. | `shape`: `icosahedron`, `dodecahedron`, `octahedron`, `box`, `sphere`, `cone`, `torusKnot` and more. `height` of the floating shape. |
| `serverRack` | A row of server cabinets with blinking lights and cables to the ceiling. | `count` of cabinets. `cables`: `false` to remove the cables. |
| `bench` | A plain block to sit on, or use as a plinth. | `width`, `height`, `depth`. |

## Things that hang on a wall

Put these at the wall's position (for example `15` across for the right wall) and turn them to face into the room.

| Type | What it is | Settings worth knowing |
| --- | --- | --- |
| `pictureFrame` | A frame. Give its **centre** height as the position's middle number. | `image`: a picture file such as `"media/photo.jpg"`. `width`, `height`. `exhibit`: a shape that floats in front of the frame, such as `"cone"`. |
| `cinemaScreen` | A big screen with a stage and two speakers. Put it at height `0`; the screen is raised for you. | `source`: `"rain"`, `"image"` or `"video"`, with `src`. `width`, `height`, `elevation` (height of the screen's centre). `stage`, `speakers`: `false` to remove them. |
| `door` | A door frame. Decoration only. Put it at height `0`. | `width`, `height`. |

## Anything else

| Type | What it is | Settings worth knowing |
| --- | --- | --- |
| `primitive` | A single shape: `box`, `sphere`, `cylinder`, `cone`, `torus`, `torusKnot`, `icosahedron`, `dodecahedron`, `octahedron`, `tetrahedron` or `plane`. | `shape`, `size`. `spin`: turning speed. `float`: how far it bobs up and down. |

## Pictures and videos

Put image and video files in the scene's `media/` folder and refer to them as `"media/name.jpg"`. Pictures are cropped to fill the frame without stretching. Videos play silently, on a loop. While a file is loading, or if it cannot be found, the screen shows the green rain instead.

> **Tip.** JPEG, PNG, SVG and WebP pictures all work. For videos, MP4 (H.264) plays in every browser.
