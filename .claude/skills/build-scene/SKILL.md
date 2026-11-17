---
name: build-scene
description: Build or change a RoomKit scene (a folder in public/scenes) from a plain-language description, and prove it matches without opening a browser. Use when asked to make a new room or scene, add or move objects or stops, lay out a gallery, office, cinema or showroom, change a scene's colours or content, or fix a scene that looks wrong.
---

# Building a scene from a description

A scene is data: `public/scenes/<name>/scene.json`, one `poi/<id>.json` per stop, and a Markdown page per stop. You write the files; four commands tell you whether they are right, each in under a second except the last. `AGENTS.md` at the repository root has the coordinate rules; read it first if you have not.

The order below matters. Writing down what the brief expects before writing the scene is what lets the tool, rather than your own rereading, say whether the room is the one that was asked for.

## 1. Write the brief down as expectations

```sh
node tools/scene.js new <name> --title="…" --brief="<the description, in the person's own words>"
```

This makes a 20 × 20 × 7 m room with one stop, `start`, holding a pedestal, and a `brief.json` with the description and an empty `expect` list. For a scene that exists, add or edit `brief.json` by hand (`{ "text": "…", "expect": [] }`).

Now fill `expect`: one entry for each thing the brief says. `node tools/scene.js keys brief` lists the forms. For "a desk in the north-east corner facing west, three pictures on the north wall, a door that leads back to the whole room":

```json
"expect": [
  { "object": "desk", "corner": "north-east" },
  { "object": "desk", "facing": "west" },
  { "count": "pictureFrame", "is": 3, "wall": "north" },
  { "stop": "pictures", "sees": ["left picture", "middle picture", "right picture"] },
  { "stop": "pictures", "order": ["left picture", "middle picture", "right picture"] },
  { "object": "door", "click": "door", "goTo": null }
]
```

- Objects are named by the `name` you will give them in the scene files, stops by their `id`. Decide those names now.
- Add what the brief implies as well: the room's size if it gives one (`{ "room": { "width": 20, "depth": 30 } }`), the order of the tour (`{ "stops": [...] }`), and for each stop that its camera sees its main objects (`sees`).
- Where the brief leaves something open (the size of the room, which corner), pick an ordinary answer, write it as an expectation, and say so in your report. Ask only when two readings would give different rooms.
- If the brief leaves the size open: 20 × 20 × 7 m suits three or four stops; allow about 6 m of wall per wall object and 5 × 5 m of floor per floor object.

The check will fail on every expectation until the scene is built. That is the point.

## 2. See what you can place, and which keys exist

```sh
node tools/scene.js prefabs            # object types: size, floor or wall, props with defaults, clickable parts
node tools/scene.js prefabs <scene>    # plus that scene's own types
node tools/scene.js keys               # sections: room, theme, camera, effects, object, at, poi, blocks, actions, screen, brief
node tools/scene.js keys <section>     # every key of one, with type, default and meaning
```

Use these sizes and keys; do not guess them and do not read the `.jsx` components for them. If no type fits, a `primitive` (box, cylinder, sphere…) or a `bench` is often enough. A new object type is a separate job with its own skill (`.claude/skills/build-prefab/SKILL.md`); do it only when the brief needs an object that no type can stand in for.

## 3. Write the files

Set the room's size in `scene.json`, and rename or delete the `start` stop (its `poi/start.json`, its `content/start.md` and its line in `scene.json › poi`). Keep the lights inside the room and about 0.4 m under the ceiling. Write only what differs from the defaults.

Say where things stand in words; the loader works out the numbers, and it knows each type's size:

| The brief says | Write |
| --- | --- |
| on, or against, a wall | `"at": { "wall": "north", "along": 0.25, "height": 3 }`. `along` is 0 at the wall's left end as seen from inside the room and 1 at its right, default 0.5; `distance` is the same in metres. `height` is the origin's y: leave it out for a door or a floor object, give a frame's centre height |
| in a corner | `"at": { "corner": "south-east" }`; `inset` keeps it off the walls. It looks diagonally into the room unless you add `facing` |
| in the middle | `"at": { "centre": true }`; `shift: [east, south]` moves it from there |
| next to, in front of, behind something | `"at": { "near": "desk", "side": "front", "gap": 1 }`. `near` is the other object's `name`; `left` and `right` are as seen standing in front of that object |
| facing something | `"facing": "west"`, `"facing": "centre"` or `"facing": "desk"`, beside `at` or `position`, in place of `rotation` |
| at an exact spot | `"position": [x, 0, z]`; then `facing`, or `"rotation": [0, yaw, 0]` (yaw 0 faces south, 90 east, 180 north, −90 west) |

Give a `name` to every object the brief speaks of: it is how `near`, `facing` and the expectations refer to it, and how the read-back calls it.

- The first object of a stop is the one its automatic camera frames, from 4 to 12 m in front of it depending on the type. That suits a stop with one main object and free floor in front of it. Write `"camera": { "position": [x, y, z], "target": [x, y, z] }` yourself when the stop has several main objects (aim between them) or when something else stands where the camera would. The view is 55° tall and about 87° wide: from distance d it takes in about 1.9 × d metres of wall across and 1.0 × d up and down.
- Each stop needs content: `{ "markdown": "content/<id>.md" }` and that file, or inline `blocks` (`keys blocks`).
- What a click does is `actions` on the object (`keys actions`); the clickable parts of each type are in `prefabs`.
- Colours are `scene.json › theme` (`keys theme`). The check tells you when text would be hard to read.
- For the shape of something you have not written before, look at a shipped scene: `public/scenes/loft` (small, L-shaped, placed in words, has a `brief.json`), `gallery` (pictures), `cinema` (screens, video, own object types), `neo-room` (live data, control desk). `examples/` beside this file pairs a brief with the scene built from it.

## 4. Check until clean

```sh
node tools/scene.js check <name> --strict
```

Each line names the file, the key, what is wrong and what to do; an unknown key says which one you probably meant. Fix and rerun. `--strict` makes warnings fail as well, which is what you want while building: a warning (`OBJ_OVERLAP`, `CAM_BLOCKED`, `WALL_FACING`…) nearly always means the room is not what was asked for.

An `EXPECT_FAILED` line says what is true instead of what the brief expects. Change the scene, not the expectation, unless the expectation was a wrong reading of the brief. The last line is `<name>: ok, N expectations hold` when you are done. `docs/guide/tester/running/scene-checks.md` explains every code.

## 5. Read it back

```sh
node tools/scene.js describe <name>
node tools/scene.js plan <name>
```

`describe` opens with the brief and then says, for each object, where it stands, what is nearest and which way it faces, and for each stop what fills its camera's picture. Expectations catch what you thought to write down; this step catches the rest. Read it against the brief once:

- every object is there, where and facing as intended, and neighbours are where the brief put them;
- under each stop, "in the picture" starts with that stop's own main objects, at a share that makes sense (a single exhibit: 10% or more; several side by side: similar shares, left and right of centre), none marked `(cut off)`, and no `NOTE:` line;
- the plan has the shape you expect.

Fix what differs, add an expectation for it, and go back to step 4.

## 6. Look at it

```sh
node tools/scene.js shots <name>
```

This takes pictures with the real viewer, a few seconds, and prints the path of one sheet: the whole room and one labelled frame per stop. Read the picture. You are looking for what words cannot tell you: an object that is technically in place but reads wrong, a stop whose view is dull or crowded, a wall that is empty where the brief wanted it full. `--views=top` shows the plan from above; `--views=<stop> --size=1280x720` is a closer look at one stop.

If the command says Chromium is missing, say so in your report and finish without the picture; do not install anything unasked.

## 7. Finish

- `make check` passes (it checks every scene, and the unit tests require the scene to be listed in `public/scenes/index.json`, which `new` did). If a test fails only because a new scene exists, that is a fault in the test: report it, do not work around it.
- Report: the layout you built, each choice you made that the brief did not, that `check --strict` is clean with how many expectations, and what the picture showed. Say plainly what was not looked at: the panel's text fit, motion, video. Those need a person at `http://localhost:5180/?scene=<name>` (`make dev PORT=5180`).

## Things that go wrong

- **A frame or door hidden in the wall, or facing out.** It was given a `position` by hand. Use `at`.
- **Left and right swapped along a wall.** `along` runs left to right for someone inside the room facing the wall: on the north wall 0 is the west end, on the south wall 0 is the east end.
- **"no object is named …".** `near`, `facing` and expectations go by an object's `name`, never by its type or its place in a list. Give the object a `name`.
- **The camera sees another stop's furniture.** Leave more room in front of the main object, or give the stop an explicit `camera`.
- **Two south walls, two south-east corners.** In an L-shaped room a compass name can match two; the error says which numbers to use instead.
- **A big object by default.** A `pedestal` is 4.9 m across and a `cinemaScreen` nearly 14 m wide; check `prefabs` before placing several. `prefabs` shows sizes at default props; after changing a size prop, `describe` shows the real one.
- **The automatic camera lands inside something.** In a small room, or with a large object in the middle, the spot in front of a stop's first object may be taken (`CAM_IN_OBJECT`, `CAM_BLOCKED`). Give that stop its own `camera`; do not shrink or move what the brief placed.
- **An expectation that cannot hold as written.** "In the corner" for an object 5 m from it fails at the default `within`. Decide whether the scene or the reading is wrong; widen `within` only when the brief is loose about it.
