# Shared events (multiplayer)

A scene can be shown as an **event**: every visitor of the same event sees the others as avatars and sees the same scene state (a paused film, a switched-off console). This page explains the design; [Running the sync server](../deploy/sync-server.md) explains how to host it. The code is `server/` (Node, no React), `src/net/` (the viewer's side) and `src/net/protocol.js` (shared by both).

## When a page is part of an event

The viewer joins an event when the address has `?event=<name>` or the scene's `scene.json` sets `multiplayer.event`. The server is `?sync=<ws url>`, else `multiplayer.url`, else the page's own origin (`wss://host/ws/<event>`); in development Vite proxies `/ws` to `make server`. Without an event nothing in `src/net/` runs and the viewer costs nothing extra.

Visitors are anonymous: a name and a colour, chosen in **Options → Online** and remembered in the browser (`localStorage`). A tab keeps a resume token in `sessionStorage`, so a reload or a dropped connection within 30 seconds gets the same avatar back.

## Two kinds of data, one socket

| | Poses (where everyone is) | Scene state (what everyone changed) |
| --- | --- | --- |
| Rate | up to 15 per second per visitor, but only while flying by hand | rare: a click |
| Loss | harmless; the newest value wins | not acceptable; every client must end up the same |
| Wire | binary frames: 13 bytes per visitor (`src/net/protocol.js`) | JSON, validated with zod on both ends |
| Server | collects the newest pose per visitor and sends **one frame per tick** (10 Hz) with every pose that changed | orders every write with one sequence number per event and forwards it; last writer wins, in the server's order |

### Flights are intents, not streams

Most of the time a visitor is parked at a stop or zoomed on a screen, and a move between stops is a deterministic flight (`src/lib/flight.js`, used by `CameraRig` and by the avatars alike). So the camera reports an **intent**: where it starts, where it goes, how long and with which curve. Every peer replays the same flight locally and the avatar glides with no traffic at all. Only **free flight** (WASD, middle-drag) streams poses, and only while the camera actually moves. In a 100-visitor event the steady state is a few packets per second in total, not 100 × 10 Hz.

Worst case, everyone free-flying at once: 99 × 13 bytes × 10 ticks ≈ 13 kB/s per visitor, ≈ 1.3 MB/s out of the server. `make bots` measures it (`tools/loadtest/bots.js`).

### Poses are drawn slightly in the past

A peer's pose samples are interpolated 150 ms behind arrival (`src/scene/Avatars.jsx`), so there is always a next sample to move towards and an uneven network shows as a small delay rather than jitter. A visitor never sees their own avatar, and the server never corrects the local camera.

## Shared state

The state of an event is a flat map **key → JSON value** (`src/net/shared.js`). A prefab reads a key with `useShared(key, initial)` and writes it with the setter it gets back; a scene author writes one from a click with the `set` and `toggle` actions. Writes are optimistic: the page shows the new value at once, sends it, and replaces it with the server's ordered version when that arrives, so everyone converges on the same order. When the server refuses the write instead (`reject`: over the rate limit, held by another visitor, stale, too big), the page drops its guess and shows the server's value again. A control that changes a value continuously, like the video scrubber, should send it once at the end of the gesture, not on every movement. Late joiners receive the whole map in the `welcome`.

Conventions:

- A screen's state uses the screen's session key as a prefix: `<scene>:<poi>:<slot>/<screen id>.video` holds `{ playing, at, t0, rate }` for a video screen (`src/net/videoSync.js`): the media time `at` it had at server time `t0`, so a late joiner seeks to the right moment from the server clock, which every client estimates from its pings.
- A prefab's own keys are given by the scene author, such as the control desk's `switch.key` (`booth.power` in the `cinema` scene).
- Keys are limited to 200 characters, values to 4 kB, writes to 10 per second per visitor, and an event holds at most 2000 keys (a write or a grab of a new key beyond that is rejected with `limit`). Every other message a visitor sends that is passed on to the room (flight intents, profile changes, grabs, drops) shares a second budget of 10 per second; beyond it the message is dropped, and a grab is answered with a `limit` reject. Pings are not counted.

### Leases

For continuous manipulation (dragging an object, later) a client may `grab` a key: the server records it as the holder and refuses other writers until the holder `drop`s it, disconnects, or stays silent for 5 seconds (an op refreshes the lease). `grabShared` / `dropShared` in `src/net/shared.js`; the editor's handles call them around a drag.

### Why not a CRDT

Yjs or Automerge would add 100–300 kB and solve offline merging the event does not need, and they cannot enforce "one holder per object". A server that orders ops gives the same convergence in a few dozen lines, with a clear place for rules.

## Protocol summary

A connection opens at `/ws/<event>` and sends a `join` (`{ t, v, scene, name, color, resume? }`) as its first frame; the server answers `welcome` (`{ id, token, now, seq, tickMs, peers, state }`) or `error` and closes. Right after the `welcome` it sends one `POSES` frame with the latest pose of every peer that flies by hand, because poses are otherwise sent only when they change and a peer that has stopped would show at the start of its flight. After that:

| From the client | From the server |
| --- | --- |
| binary `POSE` (own pose, ≤ 20 per second) | binary `POSES` (changed poses, once per tick) |
| `intent` (a flight) | `intent` (with `id` and the server time `at`) |
| `op { key, value, base? }` | `state { key, value, seq, by }` or `reject { key, reason }` |
| `grab { key }`, `drop { key }` | `lease { key, owner, until }` |
| `profile { name?, color? }` | `profile`, `join`, `leave` |
| `ping { c }` | `pong { c, s }` |

`base` makes an op a compare-and-set: it lands only if the key is still at that sequence. Every message shape is a zod schema in `src/net/protocol.js`; anything that does not parse is dropped.

## Liveness and reconnection

The client pings every 2 s; the server pings the socket every 15 s and counts a pong as "still here", so a background tab (whose timers the browser slows down) keeps its place; a client silent for 45 s is dropped and its peers get `leave`. A dropped client is kept as a ghost for 30 s: a reconnect with its token gets the same id. A reconnect with the token of a client that is still connected (its old connection is dead but the server has not noticed yet) takes over that client: the old connection is closed with code 4004, the peers see no leave and no join, and a late close of the old connection is ignored. The client reconnects by itself with exponential backoff (0.5 s to 15 s), at once when the tab becomes visible again, and after every `welcome` tells the room where the visitor is now: parked where the camera is, flying by hand from here, or, only if a flight is still under way, the rest of that flight. It does not send the old flight again, which would make every peer replay it from the start.

## Limits and scaling

One Node process holds thousands of such connections; the design limits are per event, not per process: 200 clients (`MAX_CLIENTS`), 10 Hz (`TICK_HZ`). Avatars are drawn for the nearest 120 peers, name tags for the nearest 40 within 30 m. The server is single-process by design: an event lives in one room; run more processes behind a path-based proxy if you ever need more events than one machine serves.
