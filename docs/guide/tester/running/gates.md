# Gates and CI

This page states what blocks a merge today and what the planned automated pipeline adds. The project has no CI and no remote repository yet, so every gate is run by the author and confirmed by the reviewer.

## Gates today

A change may be merged only when the author has run, and the reviewer has seen the result of:

| Gate | Command / action | Blocks when |
| --- | --- | --- |
| Lint | `make lint` | it reports an error |
| Unit tests | `make test` | any test fails; this includes building every scene in `public/scenes/` |
| Build | `make build` | it fails |
| Scenes load | open every scene from `public/scenes/index.json` | any scene shows **Could not load the scene** (the unit tests catch config errors; this catches hosting and media ones) |
| Panels render | visit every point of interest in every scene | a block is red, or the console shows an error |
| Docs build | `make docs-check` | it fails, for any change under `docs/` |
| Exploratory pass | the parts of the [exploratory checklist](../exploring/exploratory.md) that match the change | the reviewer finds a regression |

Why these: each one is cheap, and each catches a class of mistake the others cannot. Lint catches hook and scoping mistakes, the tests catch config and schema errors, the build catches code errors, panel rendering catches content errors inside Markdown, and exploration catches motion and layout. `make check` runs the first three.

## Planned CI

When the repository gets a remote, a workflow should run on every pull request: `npm ci`, `make check` (lint, tests, build) and `make docs-check`. Both would be required checks. Until they exist, this page's "Gates today" table is the contract.
