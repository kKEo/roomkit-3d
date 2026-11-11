# Working in this repository

RoomKit 3D (`scene-rooms`) shows a walkable 3D room built from data files. The camera flies between **stops** (points of interest, "POI"); each stop places objects and opens a content panel. A scene is one folder, `public/scenes/<name>/`; nothing in `src/` changes to add or edit one.

Stack: Vite, React 19, react-three-fiber, three.js, zod 4, zustand. Plain JavaScript, no TypeScript. Tests are vitest in a Node environment (no DOM).

## Commands

| Command | What it does |
| --- | --- |
| `make check` | lint, unit tests, scene checks and build: run before every commit (after `npm install`, which `make` does when needed) |
| `make test` / `make lint` / `make build` | each part alone |
| `node tools/scene.js check [scene]` | every problem in a scene, in under a second, no browser |
| `node tools/scene.js describe <scene>` | the scene in words: where each object stands, what each camera sees |
| `node tools/scene.js plan <scene>` | the floor plan as text (`--svg=file.svg` for a picture) |
| `node tools/scene.js prefabs [scene]` | every object type: size, origin, props with defaults, clickable parts |
| `node tools/scene.js new <name>` | a new scene folder, listed in `public/scenes/index.json` |
| `make dev` | the viewer at `http://localhost:5173/?scene=<name>`, the editor at `/edit.html?scene=<name>`; `PORT=5180` for another port |
| `make docs-check` | the three books under `docs/guide/` build; needed when a page is added or renamed |

## Building or changing a scene

Follow `.claude/skills/build-scene/SKILL.md`. In short: write the files, run `check` until it is clean, then read `describe` against what was asked for. Do not open a browser to find out whether an object is inside the room or a camera sees its stop; the two commands answer that from the files.

What a scene folder holds:

- `scene.json`: the room (`room.width/height/depth`, or a `room.footprint` polygon), theme, cameras, `decor` (objects that belong to no stop) and `poi` (the stop files, in tour order). It is merged over `src/config/defaults.js`, so only write what differs.
- `poi/<id>.json`: one stop: `id`, `label`, `objects` (at least one), `content` (`{ "markdown": "content/<id>.md" }` or `{ "blocks": [...] }`), and optionally `camera` and `marker`. Leave `camera` out and it is placed in front of the first object, 4 to 12 m back depending on the type; write it out when that spot is taken or the stop has several main objects.
- `content/*.md`, `media/*`, `data/*`, `prefabs/*.js`: panel pages, pictures and video, feed data, the scene's own object types.

Space: metres, `y` is up, the floor is `y = 0`. North is −Z, east is +X; a default room is centred on the origin, so a 20 × 30 room has walls at `x = ±10` and `z = ±15`. Rotation is degrees; an object faces its local +Z, so yaw 0 faces south, 90 faces east, 180 north, −90 west.

Placing objects:

- By a wall, let the loader compute it: `"at": { "wall": "north", "along": 0.4, "height": 3 }`. A wall object lands on the wall facing in; a floor object stands with its back to the wall. Use this whenever the brief says "on" or "against" a wall. Only `wall` is required: `along` defaults to 0.5 (the middle) and `height` to 0, which suits doors and floor objects; for a `pictureFrame`, `height` is its centre. All keys: `docs/guide/operator/reference/poi-json.md`, "Placing by wall".
- Anywhere else: `"position": [x, y, z]` and `"rotation": [0, yaw, 0]`. Floor objects have `y = 0`; a `pictureFrame`'s `y` is its centre height.
- Sizes come from `node tools/scene.js prefabs`; do not guess them and do not read the `.jsx` components for them.

Every key is checked strictly: an unknown key or type is an error, never ignored. Errors and findings read `<scene>/<file> › <path>: <message>`.

## Changing the app

- Config mistakes must surface as a line on the loading screen (a `ConfigError` line from `src/config/buildScene.js`), never as a renderer crash.
- A prefab is `src/prefabs/<Name>.jsx` plus `<Name>.meta.js` (props schema with a default for every key, `placement`, `hotspots`, `geometry`); see `docs/guide/operator/extending/prefab.md`. A scene's own type is one module in its `prefabs/` folder; see `scene-prefabs.md` there.
- Prefab components face +Z in local space, in metres, respect `reducedMotion`, and use the shared materials from `useWorld()`.
- A change ships with its tests (`test/*.test.js`) and its docs (`docs/guide/{user,operator,tester}`), in the same commit. New visual behaviour gets a row in `docs/guide/tester/exploring/exploratory.md`.
- The scene checks live in `src/lint/` and must stay free of findings on every shipped scene (`test/scenes.test.js`).
- Commit messages are one short line, with no body and no co-author trailer.

## Where things are

| Path | What |
| --- | --- |
| `src/config/` | loading and validating a scene: `buildScene.js`, `schema.js`, `defaults.js`, `placement.js` (`at`) |
| `src/prefabs/` | object types and their metas; `registry.js` describes the meta contract |
| `src/lint/` | scene checks (`rules.js`), geometry, the read-back (`describe.js`) and the plan |
| `src/scene/`, `src/ui/` | the three.js scene and the DOM around it |
| `src/editor/` | the in-browser editor (`edit.html`); it edits the files' text in place |
| `src/net/`, `server/` | shared events: the sync client and its Node server |
| `docs/research/` | design notes; `agent-friendly.md` explains the scene tooling and what is planned next |
