# Adding tests

This page describes the test setup and which kind of test to write for which change.

## Setup

- **Runner:** [Vitest](https://vitest.dev), configured in `vite.config.js` (`test` key), run with `npm test` or `make test`. `npx vitest` watches.
- **Location:** `test/<module>.test.js`, one file per source module or concern.
- **Environment:** Node, no DOM. Everything under test is a pure module: `src/config/*`, `src/prefabs/*.meta.js`, `src/prefabs/screenSchema.js`, `src/ui/blocks/schema.js`, `src/lib/*`, and the pure helpers of `src/scene/screens.js`. Components are not unit-tested; see [Exploring by hand](../exploring/README.md).
- **Scene check:** `test/scenes.test.js` reads every folder in `public/scenes/` from disk and builds it with `buildScene`, the same function the browser uses, so a broken scene fails `npm test` with the lines the loading screen would show. It also checks that `index.json` lists every folder.

## Which test for which change

| You changed… | Write… | Example |
| --- | --- | --- |
| the schema or defaults | a case in `test/schema.test.js` with valid and invalid configs, asserting the exact `ConfigError` lines | an unknown `type` lists the known types |
| `buildScene.js` | a case in `test/buildScene.test.js` using the in-memory fixture (`readerFromMap`): missing file, invalid JSON, duplicate ids, media resolution | `media/a.jpg` resolves against the scene folder |
| a prefab's `.meta.js` | nothing for the registration itself (`test/registry.test.js` checks every prefab's defaults, unknown keys and placement); a case in `test/autoCamera.test.js` if the placement maths is special | a wardrobe at rotation 90 puts the camera on +x |
| a prefab component | the exploratory checklist; render tests are not set up | `serverRack` with `count: 1` |
| a block or screen schema | a case in `test/blocks.test.js` with valid data and with a misspelt field | `stats` without `label` |
| camera, input, layout | not unit-testable in a useful way; extend the [exploratory checklist](../exploring/exploratory.md) | — |
| an example scene | nothing: `test/scenes.test.js` covers it | — |

## Conventions

- One behaviour per test; name it after the behaviour (`"rejects a POI without objects"`).
- Assert error **messages** where content authors read them. The [FAQ](../../user/faq.md) quotes them, so a wording change is a docs change too.
- No snapshots of 3D scene graphs; they change with every geometry tweak and catch nothing.
- `make lint` runs eslint with the `react-hooks` rules; a new `eslint-disable` comment needs a reason next to it.
