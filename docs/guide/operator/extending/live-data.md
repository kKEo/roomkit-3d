# Live data

A screen or a panel block can take its content from a URL and keep it current: numbers and graphs from an API, a node table from a monitoring endpoint, a picture or a live video stream. Nothing is rebuilt: the data is fetched by the visitor's browser while the room is open. The `neo-room` scene's control wall is the worked example: `public/scenes/neo-room/data/nodes.json`, `data/transforms.js` and `poi/07-control.json`.

## Feeds

Give a screen config (a desk's `screen`, a control desk's `screens[]`, a cinema screen's `screen`) or a `stats`/`cards`/`list`/`timeline` block a `feed`:

```json
{ "source": "dashboard", "title": "NODES", "value": "load", "filters": ["region"],
  "feed": { "url": "data/nodes.json", "refresh": 15, "transform": "nodes" } }
```

| Key | Notes |
| --- | --- |
| `url` | JSON fetched when the screen or block first appears; relative to the scene folder, or absolute |
| `refresh` | seconds between fetches while it is shown (at least 1); without it the URL is fetched once |
| `stream` | a [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) URL; every message is a JSON value |
| `transform` | the name of a function in `scene.json › transforms` that turns the response into what the screen or block shows |

`"feed": "data/kpi.json"` is short for `{ "url": "data/kpi.json" }`. Give `url`, `stream` or both: with both, the URL gives the first value and the stream every later one.

**What a feed must answer with.** For a screen, an object with any of the screen's keys except `source`, `id`, `zoom` and `feed` (for example `{ "rows": [...] }`, `{ "values": [3, 5, 8] }`, `{ "stats": [...] }`, `{ "src": "now.jpg" }`). For a block, its `data` (an array of items). Unknown keys are an error, as in the config files. If the API's shape is different, add a transform.

A feed may change a form screen's `fields`, labels and `submit`, but never its `action`: an `action` in a feed's answer is an error, and the one written in the config (or none) is kept. Data decides what visitors see; only the scene decides where what they type is sent.

**Merge order.** The keys written in the config are placeholders: each answer is merged over them, and replaces the previous answer. A relative `src` in an answer is resolved against the feed's URL.

## Transforms

A transform is a function in a plain ES module shipped with the scene, declared in `scene.json`:

```json
"transforms": {
  "nodes": "data/transforms.js#nodes",
  "kpi": "https://content.example.com/feeds/kpi.js"
}
```

`#name` picks a named export; without it the module's `transform` export is used. Several names may point into one module; it is imported once.

```js
/** data/transforms.js: no imports, like a scene prefab. */
export function nodes(json, { previous, url, event }) {
  return { title: `NODES · ${json.fleet}`, rows: json.nodes.map(n => ({ node: n.name, region: n.region, load: n.load })) };
}

/** Accumulate a wave from single readings: append to what it returned last time. */
export function cpu(json, { previous }) {
  return { values: [...(previous?.values ?? []), json.cpu].slice(-120) };
}
```

It receives the parsed response and `{ previous, url, event }`: `previous` is its own last result, `url` the URL that answered, `event` `"fetch"` or `"message"`. It returns the screen's keys (or the block's `data`); returning `undefined` keeps the previous value; throwing marks the feed as failed. It may be `async`.

Transforms load with the scene, before validation, through the same path and origin rules as [scene-shipped prefabs](scene-prefabs.md#where-modules-may-come-from). A failure is a loading-screen line `scene.json › transforms.<name>: …`, and a feed naming a transform the scene does not declare is reported with its full path, for example `poi/07-control.json › objects.0.props.screens.9.feed.transform: unknown transform "node"`. A fenced Markdown block is only read when it renders, so there an unknown transform shows as a feed error instead.

## What visitors see

| State | Screen | Panel block |
| --- | --- | --- |
| before the first answer | the config's own keys; a blinking `…` in the title bar | `data` if given, else `ui.feedLoading` |
| data | the merged config, updated in place: text keeps what it already typed if the new text extends it, bars ease to the new values, a changed stat flashes | the new data |
| failure | the last good data and a `!` in the title bar; zoomed in, "not updating" | the last data and `ui.feedStale`, or `ui.feedError` with the reason if there is none |

Each distinct failure is logged once in the console as `Feed <url>: <reason>`. Live blocks are excluded from the panel's screen-reader announcements, so a refresh is not read out every 15 seconds.

## How it runs

`src/data/hub.js` keeps one connection per data source (URL, stream and refresh together), shared by every screen and block that shows it, whatever transform each uses: four screens reading one file make one request per interval. A source starts with its first subscriber and stops with its last. Polls never overlap, are skipped while the browser tab is hidden (one catch-up fetch when it shows again), and back off after a failure, doubling from the refresh interval (at least 5 s) up to 5 minutes. A closed stream is reopened the same way. Requests send no cookies or credentials (`credentials: "omit"`), bypass the HTTP cache, and refuse an HTML answer or one larger than 2 MB.

`src/data/useFeed.js` resolves a feed's URLs against the scene folder and subscribes a component. `src/data/live.js` validates a screen's answer and merges it over the config; `ScreenSurface` passes the result to the drawer's `update()`, so the canvas is not recreated. The zoomed-in overlay subscribes to the same feed and gets the same data without another request.

## Where data may come from

Data is not code, so a feed may read from any host that allows it with CORS: the host must send `Access-Control-Allow-Origin` (your site's origin or `*`) on the JSON, the stream, and any image or video URL a feed hands back. To restrict feeds, set at build time:

```bash
VITE_DATA_ORIGINS=https://api.example.com,https://cdn.example.com npm run build
```

Then only the page's origin, the scenes' origin and the listed ones are fetched, and any other URL (including a `src` in an answer, a form's `action`, and every playlist and segment an HLS stream names) fails with `blocked: <origin> is not an allowed data origin`. A JSON feed that redirects to a blocked origin fails too (`redirected and blocked: …`); a stream, an image or a video that redirects cannot be checked by the browser's APIs, so list only hosts you trust not to forward elsewhere. Transform modules are code and follow `VITE_PREFAB_ORIGINS`.

These checks run in the page's JavaScript. The boundary the browser itself enforces is a Content-Security-Policy: see [Deploying › Content-Security-Policy](../deploy/deploy.md#content-security-policy) for a policy built from the same three settings.

## Live video

A `video` screen whose `src` ends in `.m3u8` plays an HLS stream, live or not. Browsers that play HLS themselves (Safari, recent Chrome) get it directly; others load hls.js (its light build, a separate chunk of about 115 kB gzipped) only when such a screen appears. The playlist and every segment need CORS headers. Each stream runs its own decoder and buffer, so keep to one or two per scene.

## Trying it locally

`make dev` serves two test feeds (from `vite.config.js`; they do not exist in a build):

- `/__feeds/ticker`: a Server-Sent Events stream, one message a second.
- `/__feeds/ticker.json`: the same value, fetched.

Each value has `values` and `readout` for a graph and `stats` for a stats screen, so no transform is needed: in the editor, set a screen to `{ "source": "stats", "feed": { "stream": "/__feeds/ticker" } }` and watch it tick. Do not reference these in a published scene.
