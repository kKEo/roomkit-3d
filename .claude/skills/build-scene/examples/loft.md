# Example: the loft

**Brief.** "An L-shaped loft in cyan. On the long north wall hang three exhibits in frames, the middle one taller. In the north-east corner there is a desk facing west into the room. Round the corner, in the south wing, a pedestal with a dodecahedron. A door in the inner wall leads back to the overview, and there is a bench and a floor lamp at the far end of the wing."

**Layout derived from it.**

- Room: an L, 24 × 24 m overall with the south-east quarter cut away, 7 m high: `footprint` corners `[-12,-12] [12,-12] [12,0] [0,0] [0,12] [-12,12]`. One pillar at the inner corner's west side.
- Stop `wall`: three `pictureFrame`s on the north wall at 7 m, 12 m and 17 m from its left end, centres 3 m up; the middle one 2.2 × 2.8, the others 3.4 × 2.2. The camera stands back in the middle of the room to take in all three, so it is written out.
- Stop `studio`: a `desk` at `[8, 0, -7]`, yaw −90 (facing west).
- Stop `wing`: a `pedestal` at `[-6, 0, 5]`.
- Decor: a `door` in the middle of the inner south wall (edge 2), a `bench` and the scene's own `lamp` near the south end of the wing.

**Result.** `public/scenes/loft/`. The frames and the door use `at`; the desk and pedestal stand in the open and use `position`.

**What the read-back confirms** (`node tools/scene.js describe loft`):

```text
pictureFrame (wall:0): on the north wall, 7 m from its left end of 24 m; from y 1.9 to 4.1; 3.4 m wide; facing south; …
desk (studio:0): on the floor at [8, 0, -7]; … facing west; 3.4 m from the east wall (edge 1); …
stop 3 "wing" …
  in the picture: pedestal (wing:0) 36% centre, …
```

Each line of the layout has its line in the read-back: three frames on the north wall at the intended distances, the desk in the north-east facing west, the pedestal filling a third of its stop's picture.
