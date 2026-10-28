# Scene Rooms

A walkable 3D room built from configuration files. The camera flies between **points of interest** (POIs). Each POI places one or more predefined objects (a desk, a picture on the wall, a wardrobe, a cinema screen, …) and shows a content panel. Scenes, objects and content all come from JSON and Markdown in `public/scenes/`, so you can ship new content without touching code.

Built with React, React Three Fiber and Three.js.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/ (scenes are copied from public/)
npm run preview
```

## URLs

| URL | Effect |
| --- | --- |
| `/` | the scene named by `default` in `scenes/index.json` |
| `/?scene=gallery` | loads `scenes/gallery/` |
| `/#contact` | starts at (or jumps to) the POI with `id: "contact"` |

Controls: `←`/`→` (or wheel / swipe) to move, `1`–`9` to jump to an area, `H` to hide or show the panel, `M` to hide or show the floating markers, click a marker or label in the room.

## Folder layout

```
public/scenes/
  index.json                 { "default": "neo-room", "scenes": ["neo-room", "gallery"] }
  <scene>/
    scene.json               room, theme, camera, effects, ui strings, decor, POI list
    poi/*.json               one file per point of interest
    content/*.md             panel content (referenced from POI files)
    media/*                  images / videos used by frames and screens
```

Paths inside a scene (`poi`, `content.markdown`, `image`, `src`) are relative to the scene folder.

## scene.json

Every key is optional except `poi`. Defaults are in `src/config/defaults.js`.

```jsonc
{
  "title": "Neo Room — 3D scene",          // document title
  "brand": "Neo/Room",                     // header logo; the "/" is dimmed
  "lang": "en",
  "room": {
    "width": 30, "height": 9, "depth": 30,  // the room is centred on the origin, floor at y = 0
    "grid": { "floor": 1.5, "ceiling": 3 }, // grid spacing, 0 = none
    "wallPanels": 3,                        // vertical wall lines spacing, 0 = none
    "skirting": [0.35, 8.5],                // horizontal wall lines at these heights
    "pillars": [[-9, 5], [9, 5]],           // [x, z]
    "lights": [[0, 8.4, 0], [-10, 7, 7]]    // [x, y, z]; near the ceiling = flush panel, lower = pendant
  },
  "theme": {
    "accent": "#00ff66", "accentInk": "#001a0a", "highlight": "#b8ffcc",
    "background": "#000000", "text": "#bff7cf", "textDim": "#5fa877",
    "surface": "rgba(0,16,7,.74)",          // panel background
    "fog": [14, 46],                        // near, far
    "fontsUrl": "https://fonts.googleapis.com/css2?...",
    "fonts": { "display": "\"VT323\", monospace", "body": "\"IBM Plex Mono\", monospace" },
    "hatch": { "density": 4.5, "fineDensity": 8, "roomDensity": 2.6, "roomStrength": 0.75 },
    "scanlines": true, "vignette": true,
    "glyphs": "ｱｲｳ…0123456789"             // used by the rain screens and heading scramble
  },
  "camera": {
    "fov": 55, "fovPortrait": 68,
    "intro": { "position": [0, 6.5, 27], "target": [0, 3, 0], "duration": 3200 }
  },
  "effects": {
    "ease": "quint",                        // quint | expo | back | sine | linear
    "parallax": 0.8, "warp": 12,            // warp = extra FOV (deg) mid-flight
    "particles": 520,
    "panelOffset": 0.16,                    // how far (fraction of width) the view shifts left for the panel
    "markers": true                         // floating diamond markers shown at start (toggle: header button or M)
  },
  "ui": { "loading": "Initializing room", "hint": "[←][→] … [1]–[{total}] …", "...": "see defaults.js" },
  "decor": [ { "type": "door", "position": [8.5, 0, -15] } ],   // non-interactive objects
  "poi": ["poi/01-start.json", "poi/02-projects.json"]         // order = navigation order (max 9)
}
```

## POI file

```jsonc
{
  "id": "projects",                  // used in the URL hash
  "label": "Projects",               // nav, marker label, pager
  "kicker": "west wall",             // small line above the heading ("02 of 06 · west wall")
  "screenLabel": "projects // lorem",// caption on the rain screens while here (default: label)
  "objects": [                       // one or more prefab instances
    {
      "type": "pictureFrame",
      "position": [-15, 3.2, 5],
      "rotation": [0, 90, 0],        // degrees
      "scale": 1,                    // number or [x, y, z]
      "props": { "exhibit": "torusKnot" }
    }
  ],
  "camera": { "position": [-5, 3, 4.5], "target": [-14, 3, 1.5] },  // optional
  "marker": { "position": [-13.4, 4.9, 1.5] },                       // optional
  "content": { "markdown": "content/projects.md" }
}
```

If you leave out `camera` or `marker`, they are worked out from the **first object**: its position, the direction it faces, and the prefab's placement hints. Every prefab faces local **+Z**, so `rotation[1]` sets which way it faces (`0` = +Z, `90` = +X, `-90` = −X, `180` = −Z).

Instead of `markdown` you can write the content inline:

```json
"content": { "blocks": [
  { "type": "heading", "text": "Services" },
  { "type": "markdown", "text": "Some **markdown**." },
  { "type": "list", "data": [{ "title": "Design", "text": "…" }] }
] }
```

## Prefabs

Defined in `src/prefabs/` (metadata and defaults are in `src/prefabs/registry.js`).

| type | origin | props (defaults) |
| --- | --- | --- |
| `pedestal` | floor centre | `shape: "icosahedron"`, `height: 3`, `size: 1.2`, `rings: true` |
| `pictureFrame` | wall surface, frame centre | `width: 2.9`, `height: 2.1`, `image: null`, `exhibit: null` (any shape, floats in front), `caption: true` |
| `wardrobe` | floor centre | `width: 2.4`, `height: 4.2`, `depth: 1.2`, `openOnFocus: true`, `openAngle: 105` |
| `cinemaScreen` | wall surface, floor level | `width: 10`, `height: 5.6`, `elevation: 4.3`, `source: "rain" \| "image" \| "video"`, `src`, `stage: true`, `speakers: true` |
| `desk` | floor centre | `screen: "rain" \| "image" \| "video"`, `src`, `chair: true` |
| `serverRack` | floor centre of the row | `count: 4`, `height: 5.2`, `cables: true`, `ceiling: room height` |
| `door` | wall surface, floor level | `width: 2.4`, `height: 4.2` |
| `bench` | floor centre | `width: 5.6`, `height: 0.7`, `depth: 0.9` |
| `primitive` | centre | `shape` (`box`, `sphere`, `cylinder`, `cone`, `torus`, `torusKnot`, `icosahedron`, `dodecahedron`, `octahedron`, `tetrahedron`, `plane`), `size` or raw `args`, `fill: "main" \| "fine" \| false`, `edge: "thick" \| "mid" \| "thin" \| "faint" \| "glow"`, `spin`, `float` |

Shapes also work as `pedestal.shape` and `pictureFrame.exhibit`.

### Adding a prefab

1. Create `src/prefabs/MyThing.jsx`, a component `({ props, active, hovered }) => <group>…</group>`. Build it from `<Solid>` (hatched mesh + outline) and `<Segs>` (line segments) in `src/scene/core.jsx`. Face +Z. `active` is true while its POI's panel is open.
2. Register its default props and placement hints in `src/prefabs/registry.js`.
3. Map the type to the component in `src/prefabs/index.jsx`.

## Markdown content

Standard Markdown with GFM: tables, lists, links, images. The first `# heading` gets the decode animation, and the paragraph right after it is styled as the lead. Fenced blocks with these languages render as components (the body is JSON):

````md
```stats
[{ "value": "128", "label": "projects" }, { "value": "42", "label": "clients" }]
```
```cards
[{ "title": "Project Alpha", "text": "…", "meta": "2026 · identity" }]
```
```list
[{ "icon": "/", "title": "Design", "text": "…" }]
```
```timeline
[{ "title": "2019", "text": "Studio founded." }]
```
```form
{ "fields": [{ "name": "email", "label": "E-mail", "type": "email" }, { "name": "message", "label": "Message", "type": "textarea" }],
  "submit": "Send", "action": "https://example.com/contact" }
```
````

A `form` without `action` shows the `ui.formPrototype` message. With `action`, it POSTs the fields as JSON.

## Config errors

Config files are checked when they load (`src/config/schema.js`). If anything is wrong, the loading screen lists every problem with its file and path, e.g.

```
neo-room/poi/03-archive.json › objects.0.type: unknown object type "wardobe" (known: pedestal, pictureFrame, …)
neo-room/poi/missing.json: file not found
```
