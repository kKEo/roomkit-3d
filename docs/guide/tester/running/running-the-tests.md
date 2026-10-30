# Running the tests

This page runs every check that exists today, in the order that finds problems fastest. A full run takes about ten minutes, most of it the manual part.

## 0. Lint and unit tests

```bash
make check           # make lint, make test, make build in one go
```

**Pass:** eslint prints nothing, vitest ends with `Test Files … passed`, the build ends with `✓ built in …`.
**Catches:** hook and scoping mistakes; every config and schema error in `public/scenes/`, with the same `file › path: message` lines the loading screen would show; wrong block or screen data in `content.blocks`; broken imports.
**Misses:** anything that needs a browser: rendering, fenced blocks inside Markdown, media files, motion.

## 1. Build

```bash
make build           # npm install when needed, then npm run build
```

**Pass:** the output ends with `✓ built in …` and lists `dist/assets/index-<hash>.js`.
**Catches:** syntax errors, broken imports, missing exports.
**Misses:** anything that only fails at runtime, such as a wrong prop or a bad config file.

## 2. Load every scene

```bash
make dev
cat public/scenes/index.json   # the scene names to open
```

Open `http://localhost:5173/?scene=<name>` for each name in `scenes`, with the browser console open.

**Pass:** the room flies in, the first panel opens, and the console shows no red errors.
**Fail:** the red **Could not load the scene** screen. Each line names a file and a field. The unit tests already build every scene the same way, so a failure here that the tests did not catch points at hosting: a wrong content type, a missing copy of `public/scenes/`, or a media file served from another origin without CORS headers.

## 3. Visit every point of interest

In each scene, press `1`, `2`, … up to the last number, and wait for each panel.

**Pass:** every panel opens with its title, no block is red, and no `Could not load image/video` warning appears in the console.
**Catches:** broken Markdown blocks and missing media, which only show when that panel or object renders.

## 4. Production build in a sub-path

```bash
make serve           # rebuilds, then serves dist/
```

Open `http://localhost:4173/?scene=<name>#<some-poi-id>` for at least one scene.

**Pass:** it deep-links straight to that point of interest. This checks the relative `base: './'` paths and that `public/scenes/` was copied into `dist/`.

## Docs (when you changed `docs/`)

```bash
make docs-check
```

**Pass:** the last line is `docs-check: all books build`. `create-missing = false` makes a missing file listed in `SUMMARY.md` an error.
