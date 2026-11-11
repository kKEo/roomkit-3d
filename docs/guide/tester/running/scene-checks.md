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
| `GEO_UNKNOWN`, `GEO_TILTED`, `GEO_SKIPPED` | info | positions were not checked: the prefab declares no size, the object is tilted, or `scene.json` has errors |

## How positions are known

Every prefab declares the box of its solid body and what its origin sits on (`geometry` in its meta, see the operator guide's [Adding a prefab](../../operator/extending/prefab.md)). The check turns each placed object into that box, rotated and scaled, and compares the boxes with the floor plan and with each other. Two things follow:

- The boxes are a little generous (a desk's box includes its chair), and lines such as cables and light beams are not part of them. Objects closer than 5 cm are treated as touching, not overlapping.
- An object placed on purpose where the check objects, such as a vase on a bench, is reported. Warnings do not fail `make scene-check`, but a shipped scene must be free of them; move the object or change the rule in `src/lint/rules.js` with a test.

## What it misses

How the scene looks: colours, whether a screen plays its video, text that is too long for a panel, motion. Those still need the browser pass in [Running the tests](running-the-tests.md).
