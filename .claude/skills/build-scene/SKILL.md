---
name: build-scene
description: Build or change a RoomKit scene (a folder in public/scenes) from a plain-language description, and prove it matches without opening a browser. Use when asked to make a new room or scene, add or move objects or stops, lay out a gallery, office, cinema or showroom, or fix a scene that looks wrong.
---

# Building a scene from a description

A scene is data: `public/scenes/<name>/scene.json`, one `poi/<id>.json` per stop, and a Markdown page per stop. The loop below costs a few hundred tokens a turn and no pictures. `AGENTS.md` at the repository root has the coordinate rules; read it first if you have not.

## 1. Turn the brief into a layout, in writing

Before touching a file, write the layout as a short list and keep it; step 5 checks against it.

- The room: size in metres (width east–west, depth north–south, height), or the corners of an L or U shape.
- Each stop: its id, its label, the objects it owns, and where they are **in words the tools use**: which wall (`north`, `south`, `east`, `west`), how far along it, or what it stands next to and which way it faces.
- Decor: objects that belong to no stop (doors, benches, lamps).
- What each stop's visitor should see when the camera arrives.

If the brief leaves the size open, pick one: 20 × 20 × 7 m suits three or four stops; allow about 6 m of wall per wall object and 5 × 5 m of floor per floor object. Fill what the brief does not say with ordinary choices and say so in your report; ask only when two readings would give different rooms.

## 2. See what you can place

```sh
node tools/scene.js prefabs            # built-in types
node tools/scene.js prefabs <scene>    # plus that scene's own types
```

Each type lists its size at default props, whether it is a floor or a wall object, where its origin sits, and its props with defaults and limits. Use these numbers. If nothing fits, a `primitive` (box, cylinder, sphere…) or a `bench` is usually enough; writing a new prefab is a separate, larger task (see `docs/guide/operator/extending/scene-prefabs.md`) and needs the user's agreement.

## 3. Write the files

```sh
node tools/scene.js new <name> --title="…"
```

Then edit. Keep each file small: write only what differs from the defaults.

- Objects on or against a wall use `at`: `{ "type": "pictureFrame", "at": { "wall": "north", "along": 0.25, "height": 3 } }`. `along` is 0 at the wall's left end as seen from inside, 1 at its right; `distance` gives the same in metres. Floor objects take `at` too and stand with their back to the wall.
- Objects in the open use `position` and `rotation`. Yaw 0 faces south (+Z), 90 east, 180 north, −90 west.
- The first object of a stop is the one its camera frames; put the main object first and leave `camera` out unless the automatic one is wrong.
- Each stop needs content: `{ "markdown": "content/<id>.md" }` and that file, or inline `blocks`.
- Look at a shipped scene for the shape of things you have not written before: `public/scenes/loft` (small, L-shaped, uses `at`), `gallery` (pictures), `cinema` (screens, video, own prefabs), `neo-room` (live data, control desk). `examples/` beside this file pairs briefs with the scenes built from them.

## 4. Check until clean

```sh
node tools/scene.js check <name>
```

Each line names the file, the path inside it, what is wrong and what to do. Fix and rerun; it takes well under a second. Do not stop at errors: a warning (`OBJ_OVERLAP`, `CAM_BLOCKED`, `WALL_FACING`…) nearly always means the room is not what was asked for. `docs/guide/tester/running/scene-checks.md` explains every code.

## 5. Read it back against the layout

```sh
node tools/scene.js describe <name>
node tools/scene.js plan <name>
```

Go through your list from step 1 line by line against `describe`:

- every object is there, on the wall or at the spot you intended, facing the way you intended;
- neighbours are where the brief put them ("next to", "opposite", "between");
- under each stop, "in the picture" starts with that stop's own main object, at a share of the picture that makes sense (a single exhibit: 10% or more), and no `NOTE:` line appears;
- the plan has the shape you expect.

`check` cannot know that the desk was meant to be by the window; this step can. Fix what differs and go back to step 4.

## 6. Finish

- `make check` passes (it runs the scene checks on every scene, and the unit tests require the scene to be listed in `public/scenes/index.json`, which `new` did).
- Report: the layout you built, any choice you made that the brief did not, and that `check` is clean. Say plainly that colours, text fit and motion were not looked at; those need a person at `http://localhost:5180/?scene=<name>` (`make dev PORT=5180`).

## Things that go wrong

- **A frame or door hidden in the wall, or facing out.** It was given a `position` by hand. Use `at`.
- **Left and right swapped along a wall.** `along` runs left to right for someone inside the room facing the wall: on the north wall 0 is the west end, on the south wall 0 is the east end.
- **The camera sees another stop's furniture.** Leave more room in front of the main object, or give the stop an explicit `camera` with `position` and `target`.
- **Two south walls.** In an L-shaped room a compass name can match two walls; the error says which edge numbers to use instead.
- **A big object by default.** A `pedestal` is 4.9 m across with its rings and a `cinemaScreen` nearly 14 m wide; check `prefabs` before placing several.
