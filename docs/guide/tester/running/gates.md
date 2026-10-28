# Gates and CI

This page states what blocks a merge today and what the planned automated pipeline adds. The project has no CI and no remote repository yet, so every gate is run by the author and confirmed by the reviewer.

## Gates today

A change may be merged only when the author has run, and the reviewer has seen the result of:

| Gate | Command / action | Blocks when |
| --- | --- | --- |
| Build | `make build` | it fails |
| Scenes load | open every scene from `public/scenes/index.json` | any scene shows **Could not load the scene** |
| Panels render | visit every point of interest in every scene | a block is red, or the console shows an error |
| Docs build | `make docs-check` | it fails, for any change under `docs/` |
| Exploratory pass | the parts of the [exploratory checklist](../exploring/exploratory.md) that match the change | the reviewer finds a regression |

Why these: each one is cheap, and each catches a class of mistake the others cannot. The build catches code errors, scene loading catches config errors, panel rendering catches content errors, and exploration catches motion and layout.

## Planned CI

When the repository gets a remote, a workflow should run on every pull request:

1. `npm ci` and `make build`.
2. `npm test`: the unit tests described in [Adding tests](../writing/adding-tests.md).
3. A scene lint, which validates every scene folder with the same schema the app uses, from Node.
4. `make docs-check`.

All four would be required checks. Until they exist, this page's "Gates today" table is the contract.
