# Making a new scene

This page shows how to start a whole new room, with its own size, colours and points of interest, next to the existing ones. A scene is one folder; nothing outside it changes, except one optional line to make it the default.

## 1. Create the folder

Make a folder in `public/scenes/` named after your scene, using lowercase letters, digits and `-`, for example `public/scenes/my-office/`, with these inside:

```
my-office/
  scene.json
  poi/        one file per point of interest
  content/    panel texts
  media/      pictures and videos (optional)
```

## 2. Write scene.json

The smallest useful `scene.json` names the room and lists the points of interest:

```json
{
  "title": "My Office",
  "brand": "My/Office",
  "room": { "width": 16, "height": 6, "depth": 20, "lights": [[0, 5.6, 0]] },
  "poi": ["poi/desk.json", "poi/wall.json"]
}
```

- `title` is the browser tab name. In `brand`, the `/` is shown dimmed.
- `room` sets the size in metres. The room is centred on `0`: with a width of 16, the side walls are at `-8` and `8`.
- `lights` are positions. A light near the ceiling becomes a flat ceiling panel; a lower one hangs on wires.

Everything you leave out keeps its default: the green colours, the fonts, the camera speed.

## 3. Change the look

Add a `theme` to change colours. Any colour you leave out stays green:

```json
"theme": {
  "accent": "#ffb000",
  "highlight": "#ffe0a0",
  "text": "#ffe9c2",
  "textDim": "#b08a50",
  "surface": "rgba(20,12,0,.78)",
  "scanlines": false
}
```

`accent` colours the lines in the room and the titles. `surface` is the panel background. `scanlines` turns the old-monitor stripes on or off. The `gallery` example scene uses exactly this amber theme.

You can also replace the interface words, for example the loading text and the hint at the bottom:

```json
"ui": { "loading": "Opening the office", "hint": "[←][→] — walk, [1]–[{total}] rooms, [0] whole office" }
```

In the hint, `[x]` is drawn as a key and `{total}` becomes the number of points of interest. The [Interface strings](../operator/reference/ui-strings.md) page lists every word you can replace.

## 4. Add decoration

Objects that are not points of interest, such as doors and benches, go in `decor`. They use the same format as objects in a point-of-interest file:

```json
"decor": [ { "type": "door", "position": [0, 0, 10], "rotation": [0, 180, 0] } ]
```

## 5. Open it

Open the site with `?scene=my-office` at the end of the address. To make it the scene everyone sees first, change `"default"` in `public/scenes/index.json`:

```json
{ "default": "my-office", "scenes": ["neo-room", "gallery", "my-office"] }
```

Every other setting, such as the camera fly-in, fog and particles, is listed in the [scene.json reference](../operator/reference/scene-json.md).
