# Commands

This page lists every command the project defines or relies on. Run them from the repository root. The `make` targets wrap the npm and mdBook commands; `make` alone prints them all.

## make

| Target | What it does |
| --- | --- |
| `make install` | `npm install`, only when `package.json` or `package-lock.json` changed since the last install |
| `make dev` | install if needed, then the Vite dev server, `http://localhost:5173` |
| `make build` | install if needed, then the production build into `dist/` |
| `make serve` | `make build`, then serve `dist/` at `http://localhost:4173` |
| `make test` | the unit tests (`vitest run`), including building every scene in `public/scenes/` |
| `make lint` | `eslint .` over `src/` and `test/` |
| `make check` | `make lint`, `make test`, `make build`: what a CI run does |
| `make docs` | build all three books into `site/<book>/` and copy the landing page to `site/index.html` |
| `make docs-check` | build every book into a temporary folder; fails if a book does not build, for example when `SUMMARY.md` lists a missing file |
| `make docs-serve BOOK=<book>` | live-preview one book (`user`, `operator` or `tester`) at `http://localhost:3000`, opening the browser |
| `make docs-site-serve` | `make docs`, then serve `site/` at `http://localhost:8000`: landing page plus all books, as published |
| `make all` | `make build` and `make docs` |
| `make clean` | remove `dist/` and `site/` |

Variables: `PORT=<n>` changes the port of `dev`, `serve` and `docs-serve`; `SITE_PORT=<n>` that of `docs-site-serve`.

## npm and mdBook

| Command | What it does |
| --- | --- |
| `npm install` | install the pinned dependencies from `package-lock.json` |
| `npm run dev` | Vite dev server with hot reload, default `http://localhost:5173`; add `-- --port 5199` to change the port |
| `npm run build` | production build into `dist/` (the app plus a copy of `public/scenes/`) |
| `npm run preview` | serve `dist/` locally, default `http://localhost:4173` |
| `npm test` | run the unit tests once (`vitest run`); `npx vitest` watches |
| `npm run lint` | `eslint .` |
| `mdbook build docs/guide/<book>` | build one documentation book into `site/<book>/` (`user`, `operator`, `tester`) |
| `mdbook serve docs/guide/<book>` | preview one book with live reload |

There is no format command; see the [Tester guide](../../tester/README.md) for what the tests cover.

## Build-time variables

| Variable | Effect |
| --- | --- |
| `VITE_SCENES_BASE` | where scene folders are fetched from, instead of `./scenes/` next to the page; see [Build and deploy](../deploy/deploy.md#serving-scenes-from-elsewhere) |

## URL parameters

| Parameter | Effect |
| --- | --- |
| `?scene=<name>` | load `scenes/<name>/` instead of the default from `scenes/index.json` |
| `#<poi-id>` | start at, or jump to, that POI; kept up to date as the visitor moves |
| `edit.html?scene=<name>` | the [editor](../deploy/editor.md) with that scene's files loaded; without `?scene=`, a new one-POI scene |

## In-app keys

`←` `→` `↑` `↓` `PageUp` `PageDown`, `1`–`9`, `H` (panel), `M` (markers). Details are in [Navigation and the camera](../internals/camera.md).
