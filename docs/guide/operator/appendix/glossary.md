# Glossary

This page defines the project-specific terms used in this guide.

| Term | Meaning |
| --- | --- |
| **active** | Prop passed to a prefab: true while its POI's panel is shown (`store.shown === index`). |
| **autoPlacement** | `src/lib/autoCamera.js`: derives `camera` and `marker` from the first object and its prefab's placement hints. |
| **block** | A unit of panel content (`markdown`, `heading`, `stats`, `cards`, `list`, `timeline`, `form`), rendered by `src/ui/Markdown.jsx` and `src/ui/blocks/`. |
| **ConfigError** | Error class in `src/config/schema.js` whose `lines` are shown on the loading screen. |
| **decor** | Objects in `scene.json` that are not POIs: rendered, not navigable. |
| **fat line** | A `LineSegments2` outline with a constant pixel width (`thick`, `mid`, `glow`). |
| **fill** | Which hatch material a solid uses: `main`, `fine`, `room` or `hit`. |
| **feed** | A screen's or block's live data source: `{ url, refresh, stream, transform }`, run by the hub in `src/data/hub.js`. See [Live data](../extending/live-data.md). |
| **focus** | Prefab-local point the auto-placed camera looks at. |
| **hatch** | The shader that draws light as accent-coloured line patterns. |
| **nav** | Store field `{ index, duration, nonce }`; changing it starts a camera transit. |
| **placement hints** | `registry.js` → `placement(props)`: `focus`, `cameraDistance`, `cameraHeight`, `markerOffset`. |
| **POI** | Point of interest: one navigable stop, defined by one file in `poi/`. |
| **prefab** | A predefined object type (`desk`, `pictureFrame`, …): a registry entry plus a component. |
| **rain** | The shared Matrix-rain `CanvasTexture` from `src/scene/rain.js`. |
| **runtime** | Mutable object in `src/state/store.js` for per-frame values shared with DOM overlays. |
| **scene folder** | `public/scenes/<name>/`; every relative path in a scene's files resolves against it. |
| **shown / current** | Store indices: `current` is where the camera is or is going; `shown` is whose panel is open (−1 during flights). |
| **transform** | A function in a scene-shipped module, declared in `scene.json › transforms`, that turns a feed's response into screen fields or block data. |
| **transit** | One camera flight inside `CameraRig`: curve, duration, start time, roll direction. |
| **view offset** | `camera.setViewOffset` shift that keeps the subject clear of the panel. |
| **WorldContext** | React context inside the canvas: `{ mats, rain, room, theme }`. |
