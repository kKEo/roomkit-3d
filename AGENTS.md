# Working in this repository

RoomKit 3D (`scene-rooms`) shows a walkable 3D room built from data files. The camera flies between **stops** (points of interest, "POI"); each stop places objects and opens a content panel. A scene is one folder, `public/scenes/<name>/`; nothing in `src/` changes to add or edit one.

Stack: Vite, React 19, react-three-fiber, three.js, zod 4, zustand. Plain JavaScript, no TypeScript. Tests are vitest in a Node environment (no DOM).

## Commands

| Command | What it does |
| --- | --- |
| `make check` | lint, unit tests, scene checks and build: run before every commit (after `npm install`, which `make` does when needed) |
| `make test` / `make lint` / `make build` | each part alone |
| `node tools/scene.js check [scene]` | every problem in a scene, in under a second, no browser: config, positions, cameras, the scene's own object types, and what its `brief.json` expects |
| `node tools/scene.js describe <scene>` | the scene in words: where each object stands, what each camera sees |
| `node tools/scene.js plan <scene>` | the floor plan as text (`--svg=file.svg` for a picture) |
| `node tools/scene.js prefabs [scene]` | every object type: size, origin, props with defaults, clickable parts |
| `node tools/scene.js keys [section]` | every key of a scene's files with its type, default and meaning, a section at a time |
| `node tools/scene.js new <name> --brief="…"` | a new scene folder, listed in `public/scenes/index.json`, with the description kept in `brief.json` |
| `node tools/scene.js shots <scene>` | pictures from the real viewer on one labelled sheet, in seconds: read the file it names |
| `node tools/scene.js prefab new\|check\|describe <scene> <type>` | a new object type for a scene, checked and read back in Node, no browser |
| `node tools/scene.js showroom <scene>` | a scene laid out as a gallery of its own object types, with a catalog |
| `make dev` | the viewer at `http://localhost:5173/?scene=<name>`, the editor at `/edit.html?scene=<name>`; `PORT=5180` for another port |
| `make docs-check` | the three books under `docs/guide/` build; needed when a page is added or renamed |

## Building or changing a scene

Follow `.claude/skills/build-scene/SKILL.md`. In short: write what the description expects into the scene's `brief.json`, write the files, run `check --strict` until it is clean and every expectation holds, read `describe` against what was asked for, then look at the picture from `shots`. Do not open a browser to find out whether an object is inside the room or a camera sees its stop; the commands answer that from the files.

What a scene folder holds:

- `scene.json`: the room (`room.width/height/depth`, or a `room.footprint` polygon; `room.walls` splits it into several rooms joined by doorways, see `node tools/scene.js keys walls`), theme, cameras, `decor` (objects that belong to no stop) and `poi` (the stop files, in tour order). It is merged over `src/config/defaults.js`, so only write what differs.
- `poi/<id>.json`: one stop: `id`, `label`, `objects` (at least one), `content` (`{ "markdown": "content/<id>.md" }` or `{ "blocks": [...] }`), and optionally `camera` and `marker`. Leave `camera` out and it is placed in front of the first object, 4 to 12 m back depending on the type; write it out when that spot is taken or the stop has several main objects.
- `content/*.md`, `media/*`, `data/*`, `prefabs/*.js`: panel pages, pictures and video, feed data, the scene's own object types.
- `brief.json` (optional): `{ "text": "<the description>", "expect": [ … ] }`, what the scene was built from and what must therefore be true of it. `check` evaluates every expectation; `node tools/scene.js keys brief` lists the forms. The viewer never reads it.

Space: metres, `y` is up, the floor is `y = 0`. North is −Z, east is +X; a default room is centred on the origin, so a 20 × 30 room has walls at `x = ±10` and `z = ±15`. Rotation is degrees; an object faces its local +Z, so yaw 0 faces south, 90 faces east, 180 north, −90 west.

Placing objects, in words wherever the description uses words (the loader works out the numbers and knows each type's size):

- By a wall: `"at": { "wall": "north", "along": 0.4, "height": 3 }`. A wall object lands on the wall facing in; a floor object stands with its back to the wall. Only `wall` is required: `along` defaults to 0.5 (the middle) and `height` to 0, which suits doors and floor objects; for a `pictureFrame`, `height` is its centre.
- On an interior wall (`room.walls`): `"at": { "wall": "divider", "face": "west" }`, where `face` is the side of the wall the object is on.
- In a corner: `"at": { "corner": "north-east" }`. In the middle: `"at": { "centre": true }`.
- Next to another object: `"at": { "near": "desk", "side": "front", "gap": 1 }`, where `desk` is that object's `name` and `side` is `left`, `right`, `front`, `behind` or a compass side.
- Which way it looks: `"facing": "west"`, `"facing": "centre"` or `"facing": "<name>"`, in place of `rotation`.
- Anywhere else: `"position": [x, y, z]` and `"rotation": [0, yaw, 0]`. Floor objects have `y = 0`; a `pictureFrame`'s `y` is its centre height.
- Give every object the description speaks of a `name`: placement, expectations and the read-back all go by it. All keys: `node tools/scene.js keys at`, or `docs/guide/operator/reference/poi-json.md`, "Placing in words".
- Sizes come from `node tools/scene.js prefabs`; do not guess them and do not read the `.jsx` components for them.

Every key is checked strictly: an unknown key or type is an error, never ignored, and the error names the key that was probably meant. Errors and findings read `<scene>/<file> › <path>: <message>`.

## Writing a new object type

Follow `.claude/skills/build-prefab/SKILL.md`. A type a scene brings along is one module, `prefabs/<type>.js`, with a `meta` and a `component` and no imports. `prefab new` starts it, `prefab check` renders it in Node and holds its size, mount, clickable parts and motion to what its meta declares, `prefab describe` prints its parts and draws its outline, and `showroom` turns a set of types into a room with a stop for each.

## Changing the app

- Config mistakes must surface as a line on the loading screen (a `ConfigError` line from `src/config/buildScene.js`), never as a renderer crash.
- A prefab is `src/prefabs/<Name>.jsx` plus `<Name>.meta.js` (props schema with a default for every key, `placement`, `hotspots`, `geometry`); see `docs/guide/operator/extending/prefab.md`. A scene's own type is one module in its `prefabs/` folder; see `scene-prefabs.md` there.
- Prefab components face +Z in local space, in metres, respect `reducedMotion`, and use the shared materials from `useWorld()`.
- `src/scene/core.js` (the building blocks) and `src/prefabs/sdkCore.js` have no JSX on purpose: the scene tools import them in plain Node to render scene prefabs. Keep them that way.
- What a scene tool does is a function in `tools/scene/commands.js` that returns lines; `tools/scene.js` (the command line) and `tools/mcp.js` (the MCP server) only call it. Add a command there, then to both fronts.
- A change ships with its tests (`test/*.test.js`) and its docs (`docs/guide/{user,operator,tester}`), in the same commit. New visual behaviour gets a row in `docs/guide/tester/exploring/exploratory.md`.
- The scene checks live in `src/lint/` and must stay free of findings on every shipped scene (`test/scenes.test.js`).
- Commit messages are one short line, with no body and no co-author trailer.

## Where things are

| Path | What |
| --- | --- |
| `src/config/` | loading and validating a scene: `buildScene.js`, `schema.js` (each key's `.describe()` is what `keys` prints), `defaults.js`, `placement.js` (`at`, `facing`) |
| `src/prefabs/` | object types and their metas; `registry.js` describes the meta contract; `sdkCore.js` and `sdk.js` are what a scene prefab is handed |
| `src/lint/` | scene checks (`rules.js`), expectations (`expect.js`), geometry, the read-back (`describe.js`), the plan, the key reference (`keys.js`); for scene prefabs the Node stage (`stage.js`), their checks and read-back (`prefabRules.js`, `prefabDescribe.js`) and the showroom (`showroom.js`) |
| `src/scene/`, `src/ui/` | the three.js scene and the DOM around it; `src/lib/still.js` and `src/ui/stillRig.js` are still mode (`?still`), which `shots` uses |
| `tools/` | `scene.js` (the command line), `scene/commands.js` (what each command does), `scene/shots.js` (pictures), `mcp.js` (the same tools as an MCP server, registered in `.mcp.json`) |
| `src/editor/` | the in-browser editor (`edit.html`); it edits the files' text in place |
| `src/net/`, `server/` | shared events: the sync client and its Node server |
| `docs/research/` | design notes; `agent-friendly.md` explains the scene tooling and what is planned next; `docs/guide/operator/operations/agents.md` is the short version |
