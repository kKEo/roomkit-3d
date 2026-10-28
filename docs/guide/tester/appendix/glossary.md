# Glossary: words and commands

This page defines the testing words used in this guide and repeats every command in one table.

## Words

| Word | Meaning here |
| --- | --- |
| **Check** | Anything run to find a problem: build, scene load, panel visit, exploratory step. |
| **Gate** | A check whose failure blocks a merge. See [Gates and CI](../running/gates.md). |
| **Error screen** | The red **Could not load the scene** loader, listing `file › field: problem` lines. |
| **Red block** | A panel block whose JSON or type is wrong, rendered as red text instead of a component. |
| **Scene lint** | The planned Node script that validates scene folders without a browser. |
| **Exploratory session** | A time-boxed manual pass using the [checklist](../exploring/exploratory.md), with findings written down. |
| **Finding** | Anything that differs from "Expect" in the checklist, or any console error. |
| **Draft** | A page starting with `> Draft.`: it describes something planned, not something that exists. |

## Commands

| Command | Use |
| --- | --- |
| `make` | list every target |
| `make build` | gate: the app compiles (installs dependencies when needed) |
| `make dev` | serve for scene loading and exploration, `http://localhost:5173` |
| `make serve` | build and serve the production build, `http://localhost:4173` |
| `make docs-check` | gate for docs changes |
| `make docs-serve BOOK=<book>` | preview one book while editing it |
| `npm test` | planned: unit tests |
