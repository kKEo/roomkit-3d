# Adding tests

> Draft.

This page proposes the test setup the project should adopt and which kind of test to write for which change. None of it exists yet. The first pull request that adds tests should make this page true and remove the draft marker.

## Proposed setup

- **Runner:** Vitest (it shares Vite's config and ES-module handling), added as `npm test`.
- **Location:** `src/**/*.test.js`, next to the code under test.
- **Scene lint:** `scripts/lint-scenes.mjs`, which reads every folder in `public/scenes/` from disk and runs it through `sceneSchema` and `poiSchema`. It also checks that every `poi` file, `content.markdown` file and media prop exists. The schema modules (`src/config/schema.js`, `src/prefabs/registry.js`, `src/lib/easing.js`) have no browser dependencies, so they run in Node unchanged.

## Which test for which change

| You changed… | Write… | Example |
| --- | --- | --- |
| the schema or defaults | unit tests with valid and invalid configs, asserting the exact `ConfigError` lines | an unknown `type` lists the known types |
| `loadScene.js` | unit tests with `fetch` mocked: missing file, `text/html` response, invalid JSON, duplicate ids, relative versus absolute media URLs | `media/a.jpg` resolves against the scene folder |
| `autoCamera.js` or a prefab's placement hints | numeric tests: given position and rotation, assert the camera and marker positions | a wardrobe at rotation 90 puts the camera on +x |
| a prefab component | a smoke test that it renders with default props and with each documented prop changed (React Three Fiber's test renderer) | `serverRack` with `count: 1` |
| a block | a render test with valid data, and a test that malformed data shows a message rather than throwing | `stats` with an empty list |
| camera, input, layout | not unit-testable in a useful way; extend the [exploratory checklist](../exploring/exploratory.md) | — |
| an example scene | the scene lint covers it once it exists | — |

## Conventions

- One behaviour per test; name it after the behaviour (`"rejects a POI without objects"`).
- Assert error **messages** where content authors read them. The [FAQ](../../user/faq.md) quotes them, so a wording change is a docs change too.
- No snapshots of 3D scene graphs; they change with every geometry tweak and catch nothing.
