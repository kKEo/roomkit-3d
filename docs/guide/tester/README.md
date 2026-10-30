# Tester guide

This guide is for whoever checks a change to Scene Rooms before it ships: a reviewer, a QA engineer or the author before opening a pull request. It assumes you can run npm commands and use a browser's developer tools.

> **Note.** Scene Rooms has unit tests (`make test`) for its configuration layer, including every shipped scene, a linter (`make lint`) and a GitHub Actions workflow that runs both plus the build and the docs build (see [Gates and CI](running/gates.md)), but no component or end-to-end tests. Motion, layout and input are still checked by hand. Don't assume a check exists unless a page names the command.

| Part | Read it when you need to… |
| --- | --- |
| [Part I: Running the checks](running/README.md) | check a change, find what covers an area, or know what blocks a merge |
| [Part II: Writing tests](writing/README.md) | add the first tests or prepare a pull request |
| [Part III: Exploring by hand](exploring/README.md) | look for what the checks cannot see: motion, layout, input |
| [Appendix](appendix/README.md) | look up a testing word or command |

## Conventions

- Commands run from the repository root. `localhost:5173` is the default Vite dev server address.
- "All scenes" means every name listed in `public/scenes/index.json`.
- A check **blocks** a merge when the [gates page](running/gates.md) says so. Everything else is advice.

> **Looking for something else?** To write content, read the [Content guide](../user/README.md). For architecture and configuration, read the [Operator guide](../operator/README.md).
