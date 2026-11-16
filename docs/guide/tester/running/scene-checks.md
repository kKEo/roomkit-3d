# Scene checks

`make scene-check` reads every scene folder in `public/scenes/` and lists what is wrong with it, without a browser. It takes well under a second, so run it after every edit to a scene. `make check` and CI run it too.

```sh
make scene-check                      # every scene
make scene-check SCENE=loft           # one scene
node tools/scene.js check loft --json # the same findings as JSON
node tools/scene.js check --strict    # warnings fail the run too
```

Each finding is one line: its level, a code, where to edit, what is wrong and, in brackets, what to do.

```text
warn  OBJ_OVERLAP  loft/poi/wing.json › objects.0.position: pedestal (wing:0) and bench (decor:1) overlap by 0.8 m (move one of them apart by at least that much)
loft: 0 errors, 1 warnings, 0 notes
```

A scene with a [`brief.json`](../../operator/reference/brief-json.md) also says how much of it holds: `loft: ok, 14 expectations hold`.

The command exits with 0 when no scene has an error, 1 when one has (with `--strict`, also for a warning), and 2 for a wrong command line. The test suite is stricter: `test/scenes.test.js` fails on any error or warning in a shipped scene.

## What it checks

Unlike the loading screen, which stops at the first broken file, the check reads `scene.json` and every POI file and reports all config errors in one run.

| Code | Level | Meaning |
| --- | --- | --- |
| `CONFIG` | error | a line the loading screen would show: wrong key, wrong type, missing file |
| `REF_POI` | error | a `goTo` or `zoom` action names a POI id that does not exist (the viewer would silently fly to the overview) |
| `REF_SCREEN` | warn | a `zoom` action names a screen its POI does not have |
| `REF_MEDIA` | error | a picture, video, feed file or module the scene refers to is not in the folder |
| `REF_LINK` | warn | a Markdown link or `openUrl` action points at `#id` and no POI has that id |
| `MD_BLOCK` | error | a fenced block in a Markdown page (` ```stats `, ` ```cards `, …) has a body the panel cannot show |
| `INDEX_MISSING` | warn | the folder is not listed in `public/scenes/index.json` |
| `ROOM_SIZE_IGNORED` | warn | `room.width` or `room.depth` disagrees with `room.footprint`, which wins |
| `LIGHT_OUTSIDE`, `PILLAR_OUTSIDE` | warn | a light or pillar is outside the room |
| `OBJ_OUTSIDE` | error | part of an object is outside the floor plan |
| `OBJ_OVERLAP`, `PILLAR_OVERLAP` | warn | two objects, or an object and a pillar, stand in the same place |
| `OBJ_FLOATING` | warn | a floor object whose `y` is not 0 |
| `OBJ_ABOVE_CEILING`, `OBJ_BELOW_FLOOR` | warn | an object reaches through the ceiling or the floor |
| `WALL_GAP` | warn | a wall object (frame, door, cinema screen) is not on a wall |
| `WALL_FACING` | warn | a wall object faces out of the room |
| `CAM_OUTSIDE_ROOM` | warn | a POI's camera is behind a wall or above the ceiling |
| `CAM_IN_OBJECT` | warn | a POI's camera is inside an object |
| `CAM_BLOCKED` | warn | another POI's object or a decor object stands between a camera and its target |
| `CAM_FRAMING` | warn | from a POI's camera none of the POI's own objects fills 1% of the picture |
| `THEME_CONTRAST` | warn | text would be hard to read: `text` on `background` or on `surface`, or `accentInk` on `accent`, under 4.5:1; `textDim` on `surface` or `accent` on `background` under 3:1 |
| `EXPECT_FAILED` | error | the scene is not what its `brief.json` says; the message says what is true instead |
| `EXPECT_INVALID` | error | an entry of `brief.json` cannot be read: an unknown key, a name no object has, a wall the room does not have |
| `EXPECT_SKIPPED` | info | the scene has config errors, so its brief was not checked |
| `PREFAB_…` | error, warn, info | a type the scene ships itself (`scene.json › prefabs`) is rendered without a browser and measured: see [The scene's own object types](#the-scenes-own-object-types) |
| `GEO_UNKNOWN`, `GEO_TILTED`, `GEO_SKIPPED` | info | positions were not checked: the prefab declares no size, the object is tilted, or `scene.json` has errors |

## Checking a scene against its brief

`check` cannot know that the desk was meant to stand by the window, unless the scene says so. A scene folder may hold a `brief.json` with the description it was built from and a list of expectations: which wall an object is on, what stands next to what, which way something faces, what each stop's camera sees, how many of a type there are, what a click does. Every one is evaluated on each run:

```text
error EXPECT_FAILED  loft/brief.json › expect.6: "desk" faces south, not west (the brief expects {"object":"desk","facing":"west"}; change the scene, or the expectation if the brief changed)
loft: 1 errors, 0 warnings, 0 notes, 13 of 14 expectations hold
```

An expectation is to a scene what a test is to code: written once from the brief, it also catches a later edit that quietly breaks the layout. When the brief itself changes, change the expectation. The forms are listed in the [brief.json reference](../../operator/reference/brief-json.md) and by `node tools/scene.js keys brief`; `test/expect.test.js` covers each of them, holding and failing.

## The scene's own object types

A scene may ship object types as JavaScript modules (`prefabs/*.js`). Everything the checks above know about an object's size comes from what such a module *declares*; these checks hold the declaration to what the module *does*. Each type is rendered with the real React and React Three Fiber reconciler on a canvas that draws nothing, for its default props and with each prop changed in turn, and the result is measured:

```text
warn  PREFAB_GEO_SMALL  cinema/prefabs/seats.js › geometry: box (part 5) reaches z 1.7 with { "recline": 60 }, 0.5 m past the declared box (max z 1.2) (make `geometry` contain every solid part for every prop: scene checks and placement by wall trust it)
```

That line is a real one: the first run of this check found that the cinema's seats declared a box that ignored how far the backrests lean. The codes (`PREFAB_THROWS`, `PREFAB_GEO_SMALL`, `PREFAB_MOUNT`, `PREFAB_HOTSPOT`, `PREFAB_MOTION`, `PREFAB_MATERIAL`, `PREFAB_PLACEMENT` and the rest) are listed in the operator guide's [Scene-shipped prefabs](../../operator/extending/scene-prefabs.md#writing-one-and-checking-it-without-a-browser). `node tools/scene.js prefab check <scene> [type]` runs them alone, and `prefab describe <scene> <type>` prints what a type really makes: its parts, sizes and outline.

The stage draws nothing, shows a screen as a plain plane and does not load models, so these checks say nothing about how a type looks.

## How positions are known

Every prefab declares the box of its solid body and what its origin sits on (`geometry` in its meta, see the operator guide's [Adding a prefab](../../operator/extending/prefab.md)). The check turns each placed object into that box, rotated and scaled, and compares the boxes with the floor plan and with each other. Two things follow:

- The boxes are a little generous (a desk's box includes its chair), and lines such as cables and light beams are not part of them. Objects closer than 5 cm are treated as touching, not overlapping.
- An object placed on purpose where the check objects, such as a vase on a bench, is reported. Warnings do not fail `make scene-check`, but a shipped scene must be free of them; move the object or change the rule in `src/lint/rules.js` with a test.

## Reading a scene back

Three more commands print what a scene contains, so its layout can be checked against what was asked for without opening it:

```sh
node tools/scene.js describe loft             # the scene in words
node tools/scene.js plan loft                 # the floor plan as text
node tools/scene.js plan loft --svg=loft.svg  # the same plan as a picture
node tools/scene.js prefabs loft              # the object types this scene can place
```

`describe` gives one line per object and two per stop:

```text
desk (studio:0): on the floor at [8, 0, -7]; 1.9 m east–west by 2.6 m north–south, y 0 to 2.2; facing west; 3.4 m from the east wall (edge 1); nearest: pictureFrame (wall:2), 1.8 m north-west
  camera at [2, 2.9, -7] looking east at [8, 1.6, -7], 6.1 m away, 55° tall view
  in the picture: pictureFrame (wall:2) 14% left, desk (studio:0) 13% centre
```

North is −Z and east is +X, as on the minimap. A wall is called by its side (`north wall`); in a room where two walls face the same way they also carry their number in `room.footprint` (`south wall (edge 2)`). "In the picture" lists the objects that fill at least 1% of a 16:9 view from the stop's camera, largest first, marked `(cut off)` when a quarter or more of one falls outside the picture; a stop whose own objects are all missing from it gets a `NOTE:` line, and `test/describe.test.js` fails for a shipped scene with one.

`describe` opens with the brief's text when the scene has one, so the description and the read-back can be compared in one place.

`plan` draws walls as `#`, floor as `.`, pillars as `o`, each object's outline as a letter and each stop's camera as its number, with a legend underneath. `prefabs` lists every type with its size at default props, where its origin sits, which way it faces, its props with defaults and limits, and its clickable parts; with a scene name it includes that scene's own types.

## What it misses

How the scene looks: colours, whether a screen plays its video, text that is too long for a panel, motion. Those still need the browser pass in [Running the tests](running-the-tests.md).
