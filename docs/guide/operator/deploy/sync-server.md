# Running the sync server

Shared events ([how they work](../internals/multiplayer.md)) need one small server, `server/index.js`: Node 22 or later, two dependencies (`ws`, `zod`), in memory, about 60 MB resident. The static site stays where it is (GitHub Pages or any web server); the page connects to the sync server over a WebSocket.

## Locally

```bash
make server            # ws://localhost:8787  (PORT=… npm run server)
make dev               # the viewer; Vite proxies /ws to the sync server
```

Open two browsers on `http://localhost:5180/?scene=loft&event=demo` and fly about. `make bots` (`BOTS=100`) joins 100 fake visitors to the event `load` and prints the traffic.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | listen port |
| `HOST` | `0.0.0.0` | bind address |
| `ORIGINS` | any | comma-separated page origins allowed to connect, such as `https://example.github.io`. Set it in production: a browser sends its `Origin`, and the server refuses others with 403 |
| `TICK_HZ` | `10` | how often changed poses go out |
| `MAX_CLIENTS` | `200` | per event |
| `MAX_BUFFERED_KB` | `1024` | how far a visitor's connection may fall behind before the server drops it. A quarter of this already stops sending it position frames (the next one replaces them anyway); beyond it the connection is closed and the page reconnects and resumes. It keeps a visitor who stopped reading from filling the server's memory |
| `EMPTY_TTL_MS` | `60000` | how long an event with nobody in it stays open; coming back in time keeps it, and its state |
| `STATE_DIR` | none | directory for one JSON snapshot per event (the shared state, not the visitors), written every 10 s when it changed and on shutdown, restored when the event opens again |
| `LOG` | | `debug` logs every join and leave |

Endpoints besides `/ws/<event>`: `/healthz` (`ok`) and `/status` (JSON: per event, the scene, counts of messages, bytes, poses, ops, clients and keys).

An event is named by its path (`/ws/<name>`, letters, digits, `-` and `_`) and belongs to the scene of its first visitor; a visitor of another scene is refused. An event with nobody in it (and nobody left who could resume) closes after a minute; with `STATE_DIR` its state is kept.

## Docker

```bash
docker build -f server/Dockerfile -t scene-rooms-sync .
docker run -d --name sync -p 8787:8787 -e ORIGINS=https://example.github.io -v sync-state:/state -e STATE_DIR=/state scene-rooms-sync
```

`server/compose.yml` adds Caddy in front, which obtains a TLS certificate for `SYNC_HOST` and proxies to the server, so the page can connect over `wss://`:

```bash
SYNC_HOST=sync.example.com ORIGINS=https://example.github.io docker compose -f server/compose.yml up -d
```

## Pointing the page at it

Either in the scene (`scene.json`):

```json
"multiplayer": { "url": "wss://sync.example.com", "event": "opening-night" }
```

or in the address: `https://example.github.io/roomkit/?scene=cinema&event=opening-night&sync=wss://sync.example.com`. `?event=` and `?sync=` override the scene. With no `url` the page connects to its own origin, which suits a reverse proxy that serves the site and forwards `/ws/` to the server.

A page served over `https://` can only connect to `wss://`, so the server needs TLS in production (Caddy above, or any proxy that terminates TLS and forwards WebSockets).

## Sizing

One event of 100 visitors all flying at once is about 1.3 MB/s out and 1 % of a CPU core on a laptop; parked visitors cost nothing between ticks. Watch `/status` and, in the viewer, Options → General → *Show performance overlay* (the `net` line: round trip, kB/s in and out).
