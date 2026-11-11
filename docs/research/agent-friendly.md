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

## Planned next

- **Phase 6: still mode.** `?still` and `?view=top|<poi>|x,y,z,tx,ty,tz`: no intro flight, instant camera, seeded
  `Math.random`, a pinned clock through R3F `advance()`, particles off, overlays hidden, and
  `document.documentElement.dataset.scene = 'ready' | 'error'` once prefab chunks and textures have settled. A
  `window.__roomkit` hook (store, runtime, object groups) for the harness. Known traps: a camera looking straight
  down makes `CameraRig`'s right vector zero, so the top view needs a slight offset; video screens show the rain
  fallback in Playwright's Chromium, which has no H.264.
- **Phase 7: shots.** `node tools/scene.js shots <scene>`: its own Vite server on a free port, one frame from above
  and one per stop at 640 × 360, composed into a single labelled contact sheet; fails on a console error or a
  loading-screen error line. Also a test that reads each object's mesh bounds through the hook and compares them
  with the declared geometry within 0.1 m. Expected 5–8 s per scene locally; in CI as a separate, non-blocking job.
- **Phase 8, optional.** `at: { near: "<object name>", side, gap, facing }` for placement relative to another
  object; an acceptance file of spatial assertions per scene (`onWall`, `near`, `visibleFrom`); JSON Schema
  export for editors; a framing rule (`CAM_FRAMING`) once calibrated on the shipped scenes.

## Verification

- `make check` passes, including `scene-check` on all shipped scenes.
- A deliberately broken scene (object through a wall, `goTo` to a missing stop, missing picture, broken fenced
  block) lists every problem in one run and exits with 1; see `test/lint.test.js`.
- `loft` uses `at` for its frames and door; its read-back was identical before and after the conversion apart
  from the "placed at" note.
- Trial: an agent given only `AGENTS.md` and the skill builds a small scene from a three-sentence brief and
  reaches a clean `check` without opening a browser.
