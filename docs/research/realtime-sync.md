# Real-time multi-user sync for Scene Rooms: research and implementation plan

## Context

Scene Rooms is a static Vite + React Three Fiber app (GitHub Pages, no backend). State is a zustand store
(`src/state/store.js`), per-frame camera pose lives in `runtime.pose`, per-screen local state in
`src/scene/screenState.js` sessions, and click `actions` run through `src/actions/registry.js`. Live data
arrives read-only through the feed hub (`src/data/hub.js`, polling or SSE).

Goal: an **event** = one scene shared live by 100+ visitors. Each visitor sees the others as avatars
(from their camera pose) and everyone sees the same scene state (screens interacted with, switches pressed,
later objects moved). Decisions already taken: self-hosted Node/Docker server, anonymous visitors
(nickname + colour, random id per tab), deliverable is this research + a phased plan for a prototype in this repo.

## Research summary

### 1. Transport

| Option | Verdict |
| --- | --- |
| **WebSocket (binary frames)** | **Use now.** 99%+ reach, trivial behind TLS/reverse proxy, fine for 100 clients at 10–20 Hz. Head-of-line blocking over TCP is a non-issue at these rates on a LAN/venue Wi-Fi; on bad links we mitigate with "latest wins" and a 100 ms interpolation buffer. |
| WebTransport (QUIC datagrams) | Nice-to-have later for pose packets. Safari only got it in 26.4 (Mar 2026), spec still CR; needs HTTP/3 + certs. Keep the transport behind an interface so it can be added without touching the protocol. |
| WebRTC DataChannel P2P | No. 100-peer mesh = ~10k connections; an SFU-style relay is just a server with extra ICE/TURN complexity. |
| SSE + POST | Already in the hub, but one-way and text only; wasteful for 10 Hz poses. |

### 2. Consistency model

Two very different kinds of data, two channels over one socket:

- **Presence (poses)** – high rate, ephemeral, latest value wins, loss is harmless. Server rebroadcasts the
  newest pose of every client each tick; no acks, no history.
- **Scene state (interactions)** – low rate, must converge identically on every client. **Authoritative
  server, server-ordered ops** (a sequence number per event), last-writer-wins per key, with an optional
  *ownership lease* for continuous manipulation (grabbing/moving an object). CRDTs (Yjs/Automerge) were
  considered and rejected: they add 100–300 kB, solve offline merging we don't need, and cannot enforce
  invariants (one holder per object, "the switch is either on or off"). A server that orders ops gives the
  same convergence with 50 lines of code.

Clients apply their own op optimistically and reconcile when the server's ordered version arrives.

### 3. Big win specific to this app: poses are mostly *flights*, not free motion

Visitors spend most time parked at a POI or zoomed on a screen; movement is a deterministic eased flight
(`CameraRig`, `src/lib/easing.js`). So the primary pose message is an **intent**: `{ nav: poiId | null |
zoom key, startedAt, duration, ease }`. Every remote client replays the same curve locally and the avatar
glides with zero per-frame traffic. Continuous 10–15 Hz sampling of `runtime.pose` is only needed in
**free-fly** (`store.free`), and stops when the velocity is ~0. Expected steady-state traffic for a 100-person
event is a few packets per second total, not 100×10 Hz.

### 4. Bandwidth budget (worst case: everyone free-flying)

Pose packet: `id u16 + pos 3×i16 (1 cm over ±300 m) + yaw/pitch 2×i16 + flags u8` = **13 bytes**.

| | per client | server egress (100 clients) |
| --- | --- | --- |
| 10 Hz, all 99 moving | 99×13×10 ≈ 13 kB/s ≈ 100 kbps | ≈ 1.3 MB/s ≈ 10 Mbps |
| 15 Hz, all moving | ≈ 19 kB/s | ≈ 2 MB/s |
| Realistic (≤10 % moving) | ≈ 1.3 kB/s | ≈ 130 kB/s |

A $5 VPS handles this; one Node process on `ws` serves thousands of such connections. Headroom levers if
ever needed: send only changed poses (delta), lower rate for far avatars (distance-based 2–15 Hz), cap
visible avatars at the N nearest, uWebSockets.js transport.

### 5. Server framework decision

| | Custom thin server (`ws` or uWebSockets.js) | Colyseus 0.17/0.18 | PartyServer / Durable Objects | Nakama / SpacetimeDB |
| --- | --- | --- | --- | --- |
| Fit for 2 channels + ~10 op types | exact, ~400–600 lines | good; Schema gives binary deltas for free | good, but edge model | overkill (accounts, matchmaking, DB) |
| Matches repo style (zod, pure modules, injected deps, vitest) | yes | partially (its own Schema classes, Express) | no (Workers runtime) | no |
| Ops | one container | one container | Cloudflare account | heavier |
| Risk | we own netcode bugs | framework churn (0.16→0.17→0.18 migrations, Bun transport "broken") | vendor dev model | lock-in |

**Recommendation: custom thin server on `ws`** (swap to `uWebSockets.js` only if a load test shows the need).
The room logic is a pure module (clock, sockets injected, like `createHub`) so it runs under vitest, and the
same protocol module is shared by client and server. Colyseus is plan B if scope grows (matchmaking, many
rooms per process with persistence).

### 6. Netcode details to adopt

- **Interpolation**: remote avatars render ~100–150 ms (2 ticks) in the past, lerping between the last two
  received samples (same idea as `@geckos.io/snapshot-interpolation`; implement in ~40 lines, no dependency).
  Flights use the intent replay above and need no interpolation.
- **Own avatar**: never rendered (first-person); local camera is never corrected by the server.
- **Heartbeat / liveness**: client pose or ping every 2 s; server drops after 10 s; `leave` broadcast.
- **Late join**: server sends `welcome` = full scene-state snapshot + all current poses/intents + seq.
- **Reconnect**: client keeps `clientId` + `resumeToken` in `sessionStorage`, reconnects with exponential
  backoff, server rebinds the same avatar if within 30 s, otherwise treats as a new join; client replays
  the snapshot on resume (simplest correct behaviour).
- **Ownership lease** (future "moving things"): `grab(key)` → server grants `owner` + TTL 5 s refreshed by
  updates; only the owner's `set` on that key is accepted; release on `drop`, disconnect or TTL.
- **Rate limits**: server clamps per-client poses to 20 Hz, ops to 10/s and every other forwarded message (intent, profile, grab, drop) to 10/s; at most 2000 keys per event; max message 4 kB; origin check.
- **Encoding**: poses as hand-packed `ArrayBuffer` (DataView); ops/control as JSON validated with zod on both
  ends (volume is tiny, debuggability matters). Frame byte 0 = message type.

### 7. Shared scene state model

A flat `Map<key, { value, seq, owner? }>` per event. Key convention reuses `sessionKey`
(`scene:poi:slot/screen`) plus a sub-key: e.g. `cinema:hall:0/main.video = { playing, at, t0 }`,
`loft:desk:1/lamp.on = true`. Video sync sends `{ playing, position, serverTime }` and clients seek using
the server clock offset (estimated from ping) rather than streaming positions. Terminal-style private
sessions stay local unless a prefab explicitly marks a field `shared`.

## Implementation plan (phases)

Code lives in this repo: `server/` (Node, no React), `src/net/` (client), shared `src/net/protocol.js`.
Dev: Vite proxies `/ws` to the local server; prod: static site + `wss://` URL from scene config / `?event=`.

### Phase 1 — Protocol and server core (no UI)
**Done when:** 100 bot clients connect, fly around and flip switches; all converge; egress measured.
- `src/net/protocol.js`: message types, pose pack/unpack (13-byte layout, quantisation helpers from
  `src/lib/math.js` where useful), zod schemas for `join | welcome | intent | op | ack | grab | drop | leave | ping`.
- `server/room.js`: pure `createRoom({ now, setTimer })` – clients, poses, intents, state map with seq,
  LWW + lease rules, tick loop (10 Hz, configurable), rate limits, snapshot for late joiners.
- `server/index.js`: `ws` server, one room per event id (`/ws/:event`), origin allow-list, heartbeat,
  graceful shutdown; `server/Dockerfile`; Makefile targets `server`, `server-docker`.
- `test/net.protocol.test.js`, `test/server.room.test.js` (vitest, injected clock).
- `tools/loadtest/bots.js`: N fake clients, reports msgs/s, bytes/s, p50/p95 echo latency.

### Phase 2 — Client transport and presence (avatars)
**Done when:** two browsers on `?scene=loft&event=demo` see each other fly between POIs smoothly.
- `src/net/client.js`: socket wrapper with reconnect/backoff, server-clock offset, exposes `presence`
  and `shared` subscriptions in the same subscribe/snapshot style as the hub, so UI code looks familiar.
- Publishing own state: hook into `goTo`/`openAt`/`zoomTo`/`exitZoom`/`freeFly` in `store.js` (emit intents
  from the same place `nav` is set); a `useFrame` sampler sends `runtime.pose` at ≤15 Hz only while `free`
  and moving.
- `src/scene/Avatars.jsx`: one `InstancedMesh` (capsule or simple head + body, tinted per client colour),
  per-avatar interpolation buffer, intent replay using the same curve/easing as `CameraRig` (factor the
  arc builder out of `CameraRig.jsx` into `src/lib/flight.js` so both use it). Name labels via the existing
  `src/ui/Labels.jsx` projection path, culled by distance.
- Join UI: nickname + colour prompt (random defaults) in `src/ui/Header.jsx`/`Options.jsx`; online count.
- Scene config: `multiplayer: { url, event? }` in `src/config/schema.js` + `defaults.js`; `?event=` override.

### Phase 3 — Shared scene state (interactions)
**Done when:** play/pause on the cinema screen and a switch on a prefab are mirrored for everyone, including late joiners.
- `src/net/shared.js` + hook `useShared(key, initial)` in `src/prefabs/sdk.js` (optimistic local set, server
  reconciliation, `owner` info).
- New actions in `src/actions/registry.js`: `set` (`{ key, value }`) and `toggle` (`{ key }`) routed through
  the shared store; existing `emit` unchanged. Schema in `src/prefabs/screenSchema.js` for `shared` fields.
- Convert the first prefabs: `CinemaScreen` video play/pause/seek (clock-offset based), one switch-style
  hotspot on `ControlDesk`.
- Editor: show which fields are shared in `src/editor/ScreenEditor.jsx` (read-only badge; no editing of live state).

### Phase 4 — Robustness and scale
- Distance-based pose rate and avatar cap (nearest N), culling of labels.
- Ownership leases + `grab/drop` wired to the gizmo path in `src/scene/Gizmo.jsx` for future object moving (behind a flag).
- Resume after reconnect, duplicate-tab handling, kick on bad origin, metrics line in `src/ui/PerfHud.jsx`
  (RTT, in/out kB/s, peers).
- Optional persistence: periodic JSON snapshot of the state map per event to disk, restored on restart.
- Load test target: 100 bots × 15 Hz for 10 minutes, p95 echo latency < 150 ms on a 1 vCPU container.

### Phase 5 — Deployment and docs
- Docker image, `docker compose` example with Caddy for TLS/WSS, env (`PORT`, `ORIGINS`, `TICK_HZ`).
- Operator guide pages: `docs/guide/operator/internals/multiplayer.md` (protocol, consistency model),
  `docs/guide/operator/deploy/sync-server.md`; tester guide: how to run bots and a two-browser check.
- Add `make check` coverage for the server tests; CI unchanged otherwise.

## Verification
1. `npm test` – protocol round-trips, room LWW/lease/snapshot rules, rate limiting (pure, injected clock).
2. `node tools/loadtest/bots.js --clients 100 --hz 15` against `make server`; expect ≤ 2 MB/s egress, p95 < 150 ms locally.
3. Two browsers (Chrome + Brave per the dev notes) on `http://localhost:5180/?scene=loft&event=demo`:
   flights mirrored, free-fly smooth, video play/pause mirrored, reload mid-session restores state.
4. Playwright script spawning 5 headless pages to assert avatar count and shared value convergence.

## Sources
- [WebSocket vs WebTransport](https://websocket.org/comparisons/webtransport/), [WebTransport is Baseline (Safari 26.4)](https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/), [RxDB transport comparison](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [Colyseus](https://colyseus.io/), [Colyseus 0.17 release](https://colyseus.io/blog/colyseus-017-is-here/), [Colyseus roadmap](https://docs.colyseus.io/roadmap), [Bun transport status](https://docs.colyseus.io/server/transport/bun-websockets), [Colyseus client prediction](https://docs.colyseus.io/netcode/client-prediction)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing), [DO WebSockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/index.md), [Multiplayer backends compared](https://faun.dev/toolbox/compare-multiplayer-game-backends/), [How to make a multiplayer browser game](https://app.cinevva.com/guides/multiplayer-browser-game)
- [@geckos.io/snapshot-interpolation](https://www.npmjs.com/package/@geckos.io/snapshot-interpolation), [nengi](https://github.com/MackeyK24/nengi)
- [Delta compression](https://bugnet.io/blog/how-to-cut-multiplayer-bandwidth-with-delta-compression), [Donnybrook (Microsoft Research)](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/donnybrook.pdf), [State synchronization and replication](https://kindatechnical.com/game-development/state-synchronization-and-replication.html)
- [Yjs deep dive](https://tag1consulting.com/blog/yjs-deep-dive-part-1), [BrickSync CRDT VR prototype (arXiv)](https://web3.arxiv.org/pdf/2503.17826), [SpacetimeDB Maincloud](https://spacetimedb.com/maincloud)
