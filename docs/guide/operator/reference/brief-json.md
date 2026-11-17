# brief.json reference

This page describes `brief.json`, an optional file in a scene folder that holds the description the scene was built from and what must therefore be true of it. The viewer never reads it. `node tools/scene.js check` does, and reports every expectation that does not hold, so "is this the room that was asked for" is answered by a command, and stays answered when the scene is edited later.

```json
{
  "text": "A desk in the north-east corner facing west into the room, three frames on the north wall, and a door in the south wall that leads back to the whole room.",
  "expect": [
    { "object": "desk", "corner": "north-east" },
    { "object": "desk", "facing": "west" },
    { "count": "pictureFrame", "is": 3, "wall": "north" },
    { "stop": "wall", "order": ["left frame", "middle frame", "right frame"] },
    { "object": "door", "wall": "south" },
    { "object": "door", "click": "door", "goTo": null }
  ]
}
```

| Key | Type | Notes |
| --- | --- | --- |
| `text` | non-empty string | the description, as it was given; `node tools/scene.js describe` prints it first |
| `expect` | list | one entry per thing the description says; may be empty |

Objects are named by their `name` (see the [POI file reference](poi-json.md#object)), so give a name to every object the description speaks of. Stops are named by their `id`.

## Expectations

Each entry is one object in one of these forms. The source is `EXPECTATIONS` in `src/lint/expect.js`; `node tools/scene.js keys brief` prints the same list.

| Form | Holds when |
| --- | --- |
| `{ "object": X, "wall": "north", "within": 0.1 }` | X is on or against that wall: a compass side, or the wall's number in `room.footprint`. `within` is how far off it may be, default `0.1` m |
| `{ "object": X, "corner": "north-east", "within": 2 }` | X reaches to within that many metres of the corner: a compass corner or the vertex's number; default `2` |
| `{ "object": X, "centre": true, "within": 2 }` | X's middle is within that many metres of the middle of the room; default `2` |
| `{ "object": X, "near": Y, "within": 2 }` | the gap between the outlines of X and Y is at most `within` (default `2`). `"atLeast": 3` asks for a least gap instead, or as well |
| `{ "object": X, "side": "left", "of": Y }` | X lies on that side of Y: `left`, `right`, `front`, `behind` (as someone standing in front of Y sees it) or `north`, `south`, `east`, `west`. X's middle must be within 45° of that direction from Y's |
| `{ "object": X, "facing": "west" }` | X's front points that way within 30°: one of the eight compass directions, `"centre"` (the middle of the room) or another object's name |
| `{ "object": X, "click": "door", "goTo": "wing" }` | a click on that part of X goes to that stop; `"goTo": null` is the whole-room view. Or `"opens": "<url>"` for a link, or `"action": "<type>"` for any other action |
| `{ "stop": S, "sees": [X, Y], "share": 0.02 }` | from stop S's camera each of them is in the picture, not cut off at its edge, not hidden behind another object, and fills at least that share of it; default `0.02`. The objects named together do not count as hiding each other |
| `{ "stop": S, "order": [X, Y, Z] }` | seen from stop S's camera they stand in that order from left to right |
| `{ "count": "pictureFrame", "is": 3, "wall": "north" }` | the scene has that many objects of the type. `wall` counts those on or against one wall, `stop` those of one stop; both are optional |
| `{ "room": { "width": 24, "depth": 24, "height": 7 } }` | the room measures that, in metres; give any of the three |
| `{ "stops": ["wall", "studio", "wing"] }` | the tour visits exactly those stops, in that order |

What an expectation measures is what [`describe`](../operations/commands.md) prints: outlines from each prefab's declared size, and a 16:9 picture from the stop's camera without the panel.

## Findings

```text
error EXPECT_FAILED  loft/brief.json › expect.5: "desk" is 27.4 m from the south wall, not within 0.1 m (the brief expects {"object":"desk","wall":"south"}; change the scene, or the expectation if the brief changed)
error EXPECT_INVALID  loft/brief.json › expect.6: no object is named "table" (named objects: desk, door, left frame) (see `node tools/scene.js keys brief`)
loft: 2 errors, 0 warnings, 0 notes, 12 of 14 expectations hold
```

- `EXPECT_FAILED`: the scene is not what the brief says. The message says what is true instead.
- `EXPECT_INVALID`: the entry cannot be read: an unknown key, a wrong value, a name no object has or two objects share, a wall the room does not have.
- `EXPECT_SKIPPED` (a note): the scene has config errors, so the brief was not evaluated.

Both errors fail `make scene-check` and the test suite. A scene with a brief reports how many expectations hold in its summary line: `loft: ok, 14 expectations hold`.

The `loft` example ships one (`public/scenes/loft/brief.json`). The editor carries the file through import and export unchanged; it does not edit it, so after moving things there, run the check again.
