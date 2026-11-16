# Example: the loft

**Brief.** "An L-shaped loft in cyan. On the long north wall hang three exhibits in frames, the middle one taller. In the north-east corner there is a desk facing west into the room. Round the corner, in the south wing, a pedestal with a dodecahedron. A door in the inner wall leads back to the overview, and there is a bench and a floor lamp at the far end of the wing."

**Expectations written from it** (`public/scenes/loft/brief.json`), one for each thing the brief says:

```json
{ "room": { "width": 24, "depth": 24, "height": 7 } },
{ "stops": ["wall", "studio", "wing"] },
{ "count": "pictureFrame", "is": 3, "wall": "north" },
{ "stop": "wall", "sees": ["left frame", "middle frame", "right frame"], "share": 0.04 },
{ "stop": "wall", "order": ["left frame", "middle frame", "right frame"] },
{ "object": "desk", "corner": "north-east", "within": 6 },
{ "object": "desk", "facing": "west" },
{ "stop": "studio", "sees": ["desk"], "share": 0.1 },
{ "stop": "wing", "sees": ["pedestal"], "share": 0.2 },
{ "object": "door", "wall": 2 },
{ "object": "door", "click": "door", "goTo": null },
{ "object": "bench", "side": "south", "of": "pedestal" },
{ "object": "bench", "wall": 4, "within": 1.5 },
{ "object": "lamp", "near": "bench", "within": 4 }
```

The brief gives no sizes, so the room's are a choice, written down as an expectation like the rest. "In the north-east corner" is read loosely here (`within: 6`): the desk stands in that quarter of the room, not pushed into the corner. In an L-shaped room two walls face south, so the inner one is named by its number, `2`; `describe` lists the walls with their numbers.

**Layout.**

- Room: an L, 24 × 24 m overall with the south-east quarter cut away, 7 m high: `footprint` corners `[-12,-12] [12,-12] [12,0] [0,0] [0,12] [-12,12]`. One pillar at the inner corner's west side.
- Stop `wall`: three `pictureFrame`s named `left frame`, `middle frame`, `right frame`, placed `at` the north wall 7 m, 12 m and 17 m from its left end, centres 3 m up; the middle one 2.2 × 2.8, the others 3.4 × 2.2. Three main objects, so the camera is written out: back in the middle of the room, aimed at the middle frame.
- Stop `studio`: a `desk` at `[8, 0, -7]` with `"facing": "west"`.
- Stop `wing`: a `pedestal` at `[-6, 0, 5]`.
- Decor: a `door` `at` wall 2 that goes to the overview, a `bench` (`"facing": "east"`) and the scene's own `lamp` near the south end of the wing.

**Result.** `public/scenes/loft/`.

```text
$ node tools/scene.js check loft --strict
loft: ok, 14 expectations hold
```

**What the read-back adds** (`node tools/scene.js describe loft`):

```text
left frame (wall:0): on the north wall, 7 m from its left end of 24 m; from y 1.9 to 4.1; 3.4 m wide; facing south; …
desk (studio:0): on the floor at [8, 0, -7]; … facing west; 3.4 m from the east wall (edge 1); …; turned to face: west
stop 3 "wing" …
  in the picture: pedestal (wing:0) 35% centre, …
```

**What the picture adds** (`node tools/scene.js shots loft`): four frames. The overview shows the L and its three stops; `wall` shows the three frames evenly spaced with the taller one in the middle; `studio` the desk head-on; `wing` the pedestal filling the frame with the frames of the first stop small in the distance, which is what "round the corner" should look like.
