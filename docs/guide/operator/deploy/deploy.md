# Build and deploy

This page explains what a production build contains and the four things a web server must get right to host it. The result is a static folder; there is no server-side code.

## Build

```bash
make build           # writes dist/  (npm run build)
make serve           # builds, then serves dist/ at http://localhost:4173 to check it  (npm run preview)
```

`dist/` contains:

| Path | What | Cache |
| --- | --- | --- |
| `index.html` | the page | short or `no-cache` |
| `assets/index-<hash>.js`, `.css` | the app, about 1.45 MB of JS (407 kB gzipped), mostly three.js | long, immutable (the names change with the content) |
| `scenes/` | a copy of `public/scenes/`: every scene, POI, Markdown and media file | short; this is your content |

## Hosting rules

1. **Any path works, with a trailing slash.** `vite.config.js` sets `base: './'`, so the assets and `scenes/` are found relative to the page. Serve the app as `https://host/some/path/`. Without the trailing slash, `./scenes/` resolves one level too high.
2. **Correct content types.** `.json` as `application/json`; `.md` as `text/markdown` or `text/plain`; `.svg` as `image/svg+xml`; `.mp4` as `video/mp4`. The loader treats any `text/html` response as "file not found", the way it handles the dev server's fallback, so a server that labels Markdown as HTML breaks every panel.
3. **No SPA rewrites needed.** Scenes and stops are chosen with `?scene=` and `#id`, so only `index.html` itself has to be served at the app's path. A catch-all rewrite to `index.html` is harmless for the app, but it makes missing scene files look like HTML, which still reports correctly as "file not found".
4. **CORS for media on other hosts.** Images and videos load with `crossOrigin = "anonymous"`. A file on another domain needs `Access-Control-Allow-Origin` or it fails to load, and the screen keeps showing rain.

## Updating content without a rebuild

Everything in `dist/scenes/` is read at runtime, so content authors can change, add or remove POI files, Markdown and media on the server directly. A rebuild is needed only for code changes or new prefab and block types. Keep `public/scenes/` in the repository as the source of truth, and copy it to the server with the rest of `dist/`.

## External requests

The default theme loads fonts from Google Fonts (`theme.fontsUrl`). Set it to `""` per scene to make the site fully self-contained. See the content guide's [privacy page](../../user/privacy.md).
