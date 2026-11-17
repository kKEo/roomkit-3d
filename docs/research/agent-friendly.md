# Making RoomKit friendly to coding agents: analysis and plan

## Context

A scene is data (`public/scenes/<name>/`), so in principle a coding agent can build one from a sentence such as
"a gallery with three pictures on the north wall and a desk in the corner". In practice it could write the files but
not tell whether the result was right: the only way to find out was for a person to open a browser.

Goal: building a scene from a description is **affordable**: few tokens, a few seconds, feedback mostly as text, and
a picture only as a last confirmation. Decisions taken with the owner on 2026-11-11: deliver this analysis plus the
first five phases; placement gets declarative fields in the scene files (`at`), not only a helper command.

## What stood in the way

| Finding | Evidence at the time |
| --- | --- |
| Verification was visual and manual | the tester guide: scenes, panels and anything spatial "have to be run by a person"; the one screenshot script was fixed to `cinema` on port 5180 and waited 9 s + 4 s per stop |
| Nothing checked space | no test for objects inside the room, overlaps, wall objects on a wall, cameras that see their stop; `loft` › `wing` had its automatic camera 5.5 m outside the room |
| Prefab geometry was not data | sizes were numbers inside `.jsx` components, origins were in comments, facing was a convention one prefab (`seats`) breaks |
| Placement was arithmetic | "a frame on the west wall" meant working out `x = -15`, yaw 90 |
| Errors hid each other; some mistakes were silent | a `scene.json` error hid every POI error; a `goTo` to an unknown stop flew to the overview; missing media and broken fenced blocks only showed in the browser |
| No entry point for an agent | no `AGENTS.md`, no validate command; the hand-written reference had drifted from the code in several places |

What already helped: `buildScene` is pure and runs under Node in 3–24 ms per scene; the schemas are strict zod with
`file › path: message` lines; `src/lib/footprint.js` and three.js maths need no browser; Playwright was already a
dev dependency.

## The idea: a verification ladder, cheapest rung first

| Rung | Command | Cost | Answers |
| --- | --- | --- | --- |
| 1. Check | `node tools/scene.js check <scene>` | < 1 s, a few lines of text | is anything broken or physically impossible? |
| 2. Read back | `describe`, `plan` | < 1 s, ~30 lines | is it the room that was asked for? |
| 3. Look | still mode + shots (planned) | seconds, one small image | does it look right? |
| 4. A person | the browser | minutes | taste: colour, motion, text fit |

An agent's inner loop is rungs 1 and 2. Rung 2 is the important one: `check` cannot know that the desk was meant to
stand by the east wall, but a neutral description generated from the data can be compared, line by line, with the
layout the agent derived from the brief. Words are compared with words, which is what a language model is good at
and what costs least.

Two supporting ideas keep mistakes from being made in the first place:

- **Say where, not which numbers.** `"at": { "wall": "north", "along": 0.4 }` removes the two most common errors
  (a wall object off its wall, or facing out of the room) by construction.
- **One generated source of facts.** `node tools/scene.js prefabs` prints sizes, origins, props and limits from the
  registry itself, so there is no reference page to drift and no component source to read.

## What was built (phases 1–5)

1. **Prefab geometry as data.** Optional `geometry(props)` in a prefab's meta:
   `{ min, max, mount: floor | wall | ceiling | free, front?, round? }`, the box of the solid body in local space.
   Declared for the ten built-ins and the three scene-shipped prefabs; validated in `normalisePrefab`; a prefab
   without it still works and is skipped by the geometry checks. The SDK version did not change.
2. **`inspectScene` and `check`.** `buildScene` was split so that a tolerant variant returns
   `{ scene, pois, errors }` and reads the POI files even when `scene.json` is wrong. `src/lint/rules.js` adds the
   findings the loader cannot give: references (`REF_POI`, `REF_SCREEN`, `REF_MEDIA`, `REF_LINK`, `MD_BLOCK`),
   the room (`ROOM_SIZE_IGNORED`, `LIGHT_OUTSIDE`, `PILLAR_OUTSIDE`), objects (`OBJ_OUTSIDE`, `OBJ_OVERLAP`,
   `PILLAR_OVERLAP`, `OBJ_FLOATING`, `OBJ_ABOVE_CEILING`, `OBJ_BELOW_FLOOR`, `WALL_GAP`, `WALL_FACING`) and cameras
   (`CAM_OUTSIDE_ROOM`, `CAM_IN_OBJECT`, `CAM_BLOCKED`). Every finding names the file, the path, the problem and
   a fix. `make scene-check` is part of `make check` and CI; `test/scenes.test.js` requires shipped scenes to be
   free of errors and warnings. The automatic camera is now pulled back inside the room (`clampCamera`).
   Three real problems in shipped scenes were found and fixed on the way: the `loft` `wing` camera, a bench
   standing on that stop's plinth, and a `cinema` pedestal overlapping a pillar.
3. **Read-back.** `describe` (each object relative to walls and neighbours, and what fills each stop's picture, by
   projecting the boxes through the stop's camera in Node), `plan` (text, or SVG for people) and `prefabs`.
4. **Placement by wall.** `at: { wall, along | distance, height, offset, turn }`, resolved in `buildScene` into
   ordinary `position` and `rotation` before the camera is placed, so the renderer is unchanged. Walls are named
   by compass (north is −Z) or by their number in `room.footprint`. In the editor, moving such an object or
   pressing **Convert to position** writes coordinates in place of `at`, as one undo step.
5. **Entry point.** `AGENTS.md` (with `CLAUDE.md` importing it), the `build-scene` skill with a worked example,
   `.claude/settings.json` allowing the scene tool without a prompt, and `node tools/scene.js new <name>`.

Design choices worth remembering:

- Boxes are deliberately a little generous (a desk includes its chair) and exclude lines (cables, beams). Objects
  within 5 cm count as touching. A rule that would fire on a shipped scene by design was left out rather than
  tuned: cameras of the overview and intro are outside the room on purpose, and the ceiling projector hangs below
  the ceiling.
- A WebGL-free test that compares declared boxes with rendered meshes is not realistic: prefabs are hook
  components that need materials, `useFrame` and canvas elements. The registry tests check invariants instead
  (a floor object's box starts at y 0, a wall object's at z 0, the box grows with size props). The real
  comparison belongs to phase 7.
- JSON Schema export was measured at 8–9 thousand tokens for scene + POI + props. `check` gives exact lines for
  less, so the export is deferred.

## Second round (2026-11-16): a whole scene, and new object types, from a description

Decisions taken with the owner: a "prefab gallery" is a pack of new types plus a showroom scene; prefabs stay JS
modules, checked in Node; the picture rung is built; the tools are also an MCP server. What follows the practice
of LLM scene synthesis and agent tooling: relations resolved by a solver instead of coordinates, the brief as an
executable spec, generated facts, code as the asset with execution feedback, render and critique, one command
library behind every front.

6. **Placement in words.** `facing` (a compass direction, `"centre"`, another object) and three more forms of `at`:
   `corner`, `centre`, `near`. Objects refer to each other by `name` only, because indexes and types change under
   the editor. Position and rotation are resolved separately in a scene-wide pass (`placeAll`), in rounds, so two
   objects may face each other; a circle of `near` is an error. The wall form now sets a turned floor object by
   its rotated outline.
7. **Facts and the brief.** `keys [section]` prints every key from the zod schemas (each key's `.describe()`);
   a test fails when a reference page misses one. Unknown keys name the key that was meant. `brief.json` holds the
   description and expectations (twelve forms: wall, corner, centre, near, side, facing, click, sees, order, count,
   room, stops) that `check` evaluates: `EXPECT_FAILED` says what is true instead. Also `THEME_CONTRAST` and
   `CAM_FRAMING`.
8. **The prefab loop.** A scene prefab is rendered in Node by the real React and React Three Fiber reconciler on
   a canvas that draws nothing (`src/lint/stage.js`): 30 ms, real hooks and refs. For that, `src/scene/core.js`
   lost its JSX and the SDK was split into `sdkCore.js` plus six browser keys. `prefab check` samples every prop
   and holds the measured parts to the declared box, mount, hotspots and motion; `prefab describe` lists the parts
   and draws three outline views; `prefab new` starts from a template that passes.
9. **The gallery.** `showroom` lays a scene out as bays, stops, cameras and pages for its own types and writes
   the catalog; it is clean under `check --strict` by construction.
10. **Looking.** `?still` (no fly-in, overlays or sway; `window.__roomkit.view()`), and `shots`: its own Vite
    server, headless Chromium, the overview and each stop on one labelled sheet in three to six seconds.
    `--measure` compares drawn parts with declared boxes for every object, built-ins included.
11. **Reach.** `tools/scene/commands.js` is what every command does; `tools/scene.js` and `tools/mcp.js`
    (`@modelcontextprotocol/server`, sixteen tools) are fronts. `scene_write` answers with the check.

What the new checks found in shipped code, all fixed: the cinema seats' box ignored `recline` (backrests 0.5 m
past it at 60°); the server rack's box left out its cable tray; the wardrobe's clothes hung outside the cabinet
(a factor of two in their spacing, visible in the picture once one knew to look).

Design choices worth remembering:

- An imitation SDK (stub hooks, a hand-written walker) was the first design; a review showed it would be a second
  implementation of `Solid` and would hide state-driven behaviour. The real reconciler was a probe away.
- The declared box must *contain* the measured body with 5 cm slack; a two-sided comparison fails prefabs whose
  boxes are generous on purpose.
- A long-lived process must re-import a changed module: the file's time and size ride on the URL (`freshImport`).
- The showroom writes cameras and markers out instead of trusting each type's `placement` hints.
- Pictures are for looking, not diffing: rain, the hatch scan band and cursors vary from run to run.

Trial (2026-11-20): two fresh agents, each given one paragraph and nothing else. One built `reading-room`
(four stops, a theme, relative placement, a door action) to `check --strict` clean with 21 expectations and a
picture; the other wrote three object types (armchair, coffee table, wall clock) that passed `prefab check` first
time, made the showroom and took the picture. That pack ships as `public/scenes/lounge-pack`. What they tripped
on, and what was changed:

- the showroom's cameras stood at least 4 m back, so small objects filled 1–3% of their frame: now 2 m at least;
- a brief with text and no expectations reported plain `ok`: the summary now says it expects nothing yet;
- "fills 2% of the picture, less than 2%": shares under a tenth are printed with a decimal;
- `sees` passed an object the picture showed cut at the edge (the read-back's "(cut off)" allows a quarter to be
  missing): `sees` now wants 93% of the outline in the frame, which also caught the loft's own pedestal;
- the desk's front is its chair side, which `prefabs` did not say: its blurb does now.

Not changed, and worth doing next: expectations have no form for where along a wall an object is, for a prop's
value or for the theme; the automatic camera gives up where a diagonal would do; `shots --views` writes over the
full sheet; "left end" of a wall is ambiguous to a reader who thinks in plan view.

## Planned next

- The picture run in CI as a separate, non-blocking job (needs a browser on the runner).
- `camera: { frame: [...] }`: an automatic camera that takes in several named objects.
- JSON Schema files for editors, exported from the same schemas `keys` prints.
- The stage for built-in prefabs: they import React directly, so they would need the test transform or the same
  SDK injection scene prefabs have.
- An assistant inside the browser editor (needs a model API key and a proxy): a different project.

## Verification

- `make check` passes, including `scene-check` on all shipped scenes.
- A deliberately broken scene (object through a wall, `goTo` to a missing stop, missing picture, broken fenced
  block) lists every problem in one run and exits with 1; see `test/lint.test.js`.
- `loft` uses `at` for its frames and door; its read-back was identical before and after the conversion apart
  from the "placed at" note.
- Trial: an agent given only `AGENTS.md` and the skill builds a small scene from a three-sentence brief and
  reaches a clean `check` without opening a browser.
