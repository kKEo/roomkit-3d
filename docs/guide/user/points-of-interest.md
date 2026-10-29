# Placing a point of interest

This page explains every line of a point-of-interest file: where the object stands, which way it faces, where the camera stops, and what the panel shows. Each point of interest is one file in the scene's `poi/` folder.

## A complete example

```json
{
  "id": "projects",
  "label": "Projects",
  "kicker": "west wall",
  "screenLabel": "projects // lorem",
  "objects": [
    { "type": "pictureFrame", "position": [-15, 3.2, 5], "rotation": [0, 90, 0], "props": { "exhibit": "torusKnot" } },
    { "type": "bench", "position": [-11.6, 0, 1.5], "rotation": [0, 90, 0] }
  ],
  "camera": { "position": [-5, 3, 4.5], "target": [-14, 3, 1.5] },
  "marker": { "position": [-13.4, 4.9, 1.5] },
  "content": { "markdown": "content/projects.md" }
}
```

| Line | What it does | Needed? |
| --- | --- | --- |
| `id` | Short name used in links (`#projects`). Letters, digits, `-` and `_` only; unique in the scene. | yes |
| `label` | Name shown in the top bar, on the floating label and on the next/previous buttons. | yes |
| `kicker` | Small line above the panel title, after the stop number, e.g. "02 of 07 · west wall". | no |
| `screenLabel` | Words shown on the green "rain" screens while the visitor is here. Defaults to the label. | no |
| `objects` | One or more things to place in the room. See below. | yes |
| `camera` | Where the camera stops and what it looks at. Worked out for you if left out. | no |
| `marker` | Where the floating diamond and its label hang. Worked out for you if left out. | no |
| `content` | What the panel shows. See [Writing panel content](content.md). | yes |

## Finding your way around the room: positions

Positions are three numbers, `[across, up, depth]`, in metres:

- **across** goes from the left wall to the right wall, with `0` in the middle. In the example room the walls are at `-15` and `15`.
- **up** is height above the floor. `0` is the floor.
- **depth** goes from the far wall (negative) to the near wall (positive), with `0` in the middle. When the visitor arrives they are looking towards the far wall.

The room's size is set in its `scene.json`. The far wall is at minus half the depth, the near wall at plus half.

## Which way an object faces: rotation

`rotation` is three angles in degrees. You will almost always change only the middle one, which turns the object around the vertical axis:

| Middle number | The object faces… | Use it for an object against… |
| --- | --- | --- |
| `0` | towards the near wall | the far wall |
| `180` | towards the far wall | the near wall |
| `90` | towards the right wall | the left wall |
| `-90` | towards the left wall | the right wall |

Any angle works; the example desk uses `-45` to sit diagonally in a corner.

## Letting the app place the camera

Leave out `camera` and `marker` and the app places them from the **first** object in the list: the camera stands in front of the object at a distance that suits its type, and the diamond floats just above it. This works well for single objects. Add `camera` yourself when one stop shows several objects, as in the example above, or when something blocks the view.

`camera.position` is where the camera stands; `camera.target` is the point it looks at. Both are positions in the room.

## Order and number

The order of the files in the scene's `"poi"` list is the walking order and sets the numbers (01, 02, …). A scene can have up to nine points of interest, one per number key.
