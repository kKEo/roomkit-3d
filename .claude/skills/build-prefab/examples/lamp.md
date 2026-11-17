# Example: the floor lamp

**Description.** "A floor lamp: a round base, a thin pole and a cone-shaped shade that turns slowly. The shade can be clicked. Faint rays fall from the shade to the floor when it is lit. The height can be set."

**Parts list derived from it.**

- Stands on the floor; origin under the pole.
- Base: a low cylinder, 0.7 m across, 0.06 m high.
- Pole: a cylinder 6 cm thick, as tall as `height`.
- Shade: a cone 0.8 m across and 0.5 m high, centred on the top of the pole; clickable as `shade`; turns about the pole, faster while its stop is shown, not at all under reduced motion.
- Rays: four lines from under the shade to the floor, 0.9 m out; only when `lit`. Lines, so not part of the box.
- Props: `height` (1.8), `lit` (true), `spin` (0.3 turns' worth per second).
- Box: 0.4 m either side of the pole, from the floor to `height + 0.25`, round.

**Result.** `public/scenes/loft/prefabs/lamp.js`.

**What the read-back confirms** (`node tools/scene.js prefab describe loft lamp`):

```text
lamp: "Floor lamp", a lamp on a pole whose shade turns
declared: a floor object, faces +z; 0.8 wide × 2.05 high × 0.8 deep (round): x -0.4…0.4, y 0…2.05, z -0.4…0.4
measured: its solid parts are 0.8 wide × 2.05 high × 0.8 deep: x -0.4…0.4, y 0…2.05, z -0.4…0.4; lines reach x -0.9…0.9, y 0…2.05, z -0.9…0.9
parts (3 solids, 1 line set):
   1  cylinder 0.7 × 0.06 × 0.7 at [0, 0.03, 0]
   2  cylinder 0.05 × 1.8 × 0.06 at [0, 0.9, 0]; line mid
   3  cone 0.8 × 0.5 × 0.8 at [0, 1.8, 0]; fill fine, line mid, clickable as "shade", moves
   4  lines 1.8 × 1.53 × 1.8 at [0, 0.78, 0]; faint
clickable parts: shade
moves on its own: cone (part 3)

front (from the front: x runs right, y up; one character is 0.08 m wide, one line 0.16 m):
             ##
           ######
         #########
        ###########
            :##:
          :: ##::
         ::  ## ::
        ::   ##  ::
       ::    ##   ::
      ::     ##     :
     ::      ##      ::
   ::        ##       ::
  ::     #########     ::
  :      ##########     :
```

Each line of the parts list has its line in the read-back: the base on the floor, the pole to 1.8 m, the shade on top of it and clickable, the rays as lines that reach past the declared box without being part of it, and the measured box equal to the declared one. In this lamp the parts have no `name`, so they are called by their shape; with names the list reads better still.
