# Gates and CI

This page states what blocks a merge: the gates a GitHub Actions workflow runs on every push to `master` and every pull request, and the ones the author and reviewer still run by hand.

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

## CI

The workflow in `.github/workflows/build.yml` runs on every push to `master` and every pull request, and can be started by hand from the Actions tab. It has two jobs:

| Job | Runs | Keeps |
| --- | --- | --- |
| **Lint, test and build** | `npm ci`, then `make lint`, `make test` and `make build` on Node 22 | the `dist/` folder as a workflow artifact named `dist`, for seven days by default |
| **Docs build** | installs a pinned mdBook, then `make docs-check` | nothing; it only has to pass |

Both jobs are meant to be required checks on `master`. They cover the first three gates in the table above and the docs gate. The **Scenes load**, **Panels render** and **Exploratory pass** gates need a browser and still have to be run by a person. A new push to the same branch cancels the run still in progress.

To reproduce a red job locally, run the same commands: `make check` for the first job, `make docs-check` for the second.
