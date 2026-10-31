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

## GitHub Pages

The workflow in `.github/workflows/build.yml` publishes every push to `master` to GitHub Pages, after the lint, tests, build and docs build have passed:

| Address | What |
| --- | --- |
| `https://kkeo.github.io/roomkit-3d/` | the app (`dist/`); the editor is at `edit.html` |
| `https://kkeo.github.io/roomkit-3d/docs/` | the documentation landing page and the three guides |

It needs one repository setting, made once: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Pages serves the content types above correctly and adds no rewrites, so the hosting rules hold without configuration. The `docs/` prefix is fixed in each guide's `book.toml` (`site-url`); change it there if the repository is renamed.

## Serving scenes from elsewhere

By default the app looks for scenes in `./scenes/` next to `index.html`. To host one build of the viewer and publish scene folders somewhere else (a bucket, a content server), set `VITE_SCENES_BASE` when building:

```bash
VITE_SCENES_BASE=https://content.example.com/rooms/ npm run build
```

The value may be absolute or relative to the page, and ends up in the bundle, so a scene folder at `…/rooms/<name>/` is reachable as `?scene=<name>`. The content host must send the content types above and, being another origin, `Access-Control-Allow-Origin` for every file. The base is fixed at build time on purpose: taking it from the URL would let anyone point your viewer at their content.

## Updating content without a rebuild

Everything in `dist/scenes/` is read at runtime, so content authors can change, add or remove POI files, Markdown and media on the server directly, and a scene can ship its own object types as modules in its folder (`scene.json › prefabs`, see [Scene-shipped prefabs](../extending/scene-prefabs.md)). A rebuild is needed only for code changes, new built-in prefab types and new block types. Keep `public/scenes/` in the repository as the source of truth, and copy it to the server with the rest of `dist/`.

Live data needs no rebuild either: screens and panel blocks with a `feed` fetch it while the room is open, and transform modules (`scene.json › transforms`) live in the scene folder like prefab modules. See [Live data](../extending/live-data.md).

Scene prefab and transform modules must be served as `text/javascript` (a SPA fallback that answers `index.html` for unknown paths breaks the import). By default they may come only from the page's origin or the scenes' origin; `VITE_PREFAB_ORIGINS` (a comma-separated list of origins, or `*`) allows others at build time, and such a host needs `Access-Control-Allow-Origin` on the module and on the models and textures it loads.

## External requests

The default theme loads fonts from Google Fonts (`theme.fontsUrl`). Set it to `""` per scene to make the site fully self-contained.

A scene's live feeds and HLS video URLs are requested by the visitor's browser from whatever hosts the scene names; the app sends no cookies or credentials with feeds, and accepts at most 2 MB per answer or stream message. To keep feeds to known hosts, build with `VITE_DATA_ORIGINS` (comma-separated origins): then only the page's origin, the scenes' origin and those are fetched, for feeds, for the media and HLS segments a feed or playlist names, and for a form's `action`; a JSON feed that redirects elsewhere is refused too. Data hosts must send `Access-Control-Allow-Origin`, and a Content-Security-Policy needs them in `connect-src` (feeds, streams and forms) and `media-src` / `img-src` (video and images); see [Content-Security-Policy](#content-security-policy) below. hls.js is a separate chunk in `dist/assets/` (`hls.light-*.js`), fetched only when a scene plays an HLS stream in a browser without native HLS. See the content guide's [privacy page](../../user/privacy.md).

## Content-Security-Policy

The origin rules above (`VITE_PREFAB_ORIGINS`, `VITE_DATA_ORIGINS`) are checked by the app's own JavaScript (`src/config/origins.js`). The boundary the **browser** enforces is a Content-Security-Policy, so send one as a response header from the web server (a `<meta http-equiv="Content-Security-Policy">` in `dist/index.html` and `dist/edit.html` works too, but cannot carry `frame-ancestors`). Build it from the same settings. With the app and its scenes on one host, and feeds from `https://api.example.com`:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self' https://api.example.com;
  img-src 'self' data: blob: https://api.example.com;
  media-src 'self' blob: https://api.example.com;
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'self';
```

| Directive | What to list | Why |
| --- | --- | --- |
| `script-src` | the page, the origin of `VITE_SCENES_BASE`, every `VITE_PREFAB_ORIGINS` entry. Never `'unsafe-eval'` or `*` | scene prefab and transform modules are `import()`ed; this directive decides which hosts may run code in your page, whatever the app's own check says |
| `connect-src` | the page, the scenes' origin, every `VITE_DATA_ORIGINS` entry | scene files, feeds, streams, HLS playlists and segments, and form `action`s. Without `VITE_DATA_ORIGINS`, every host a scene's feeds name must be here, or the browser refuses it |
| `img-src`, `media-src` | the same data origins, plus `data:` and `blob:` | image and video screens, a `src` a feed hands back, textures and hls.js buffers |
| `worker-src` | `'self' blob:` | hls.js demuxes in a Web Worker |
| `style-src`, `font-src` | `'unsafe-inline'`; the Google Fonts hosts while scenes keep the default `theme.fontsUrl` | React sets inline `style` attributes (overlay geometry, accent colours); a scene with `"fontsUrl": ""` needs no font hosts |
| `form-action` | `'none'` | forms submit with `fetch` and never navigate |

A policy that is too tight shows up as `Refused to …` errors in the console, a scene that does not load, or a feed marked `!`. Roll it out with `Content-Security-Policy-Report-Only` first, then switch to the enforcing header. Remember that whoever can write to the scenes' origin can ship modules that run in your page: treat that host like the app's own.
