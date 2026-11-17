# Part III: Configuration reference

This part lists every configuration key, every prefab prop and every interface string, with its type, default and constraint. It is the page to keep open while editing a scene. For a gentler introduction to the same files, see the [Content guide](../../user/README.md).

- [scene.json reference](scene-json.md): room, theme, camera, effects, decor and POI list.
- [POI file reference](poi-json.md): objects, camera, marker and content.
- [brief.json reference](brief-json.md): the description a scene was built from, and the expectations the scene check holds it to.
- [Prefab reference](prefabs.md): every object type, its props, defaults and placement hints.
- [Interface strings](ui-strings.md): every replaceable word in the interface.

Sources of truth: `src/config/defaults.js` (defaults), `src/config/schema.js` (types and constraints), `src/prefabs/registry.js` (prefabs).

`node tools/scene.js keys [section]` prints the same keys straight from those sources: type, default and one line of meaning each, a section at a time (`room`, `theme`, `camera`, `effects`, `object`, `at`, `poi`, `blocks`, `actions`, `screen`, `brief`, …). It is the quickest thing to hand a coding agent, and `test/keys.test.js` fails when a key it lists is missing from these pages.
