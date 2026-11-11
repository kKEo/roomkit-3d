import {
  PROTOCOL_VERSION, POSE_FLAGS, clientMessage, parseMessage, unpackFrame, packPoses,
} from '../src/net/protocol.js';

/**
 * One event: the visitors of one scene who see each other and share its state. Pure: the clock, the
 * timers and the connections are injected, so it runs under test (see test/server.room.test.js) and
 * behind any transport (server/index.js puts it behind `ws`).
 *
 * A connection is `{ send(data), close(code, reason) }`; `data` is a string (JSON) or an ArrayBuffer.
 *
 * What the room keeps:
 * - *clients*: id (u16, reused after a while), profile, latest pose, latest flight intent, liveness;
 * - *state*: a flat map key → `{ value, seq, by, owner?, until? }`. Every accepted op gets the next
 *   sequence number (one counter per room), so every client applies the same ops in the same order:
 *   last writer wins, where "last" is the server's order. A key may be *leased* (`grab`): only the
 *   holder's ops are accepted until it drops the key, leaves, or the lease expires without a refresh.
 * - *ghosts*: clients that disconnected, kept for `resumeMs` so a reconnect with the same token gets
 *   its id (and its peers see one avatar, not a leave and a join).
 *
 * Poses are not broadcast on arrival: `tick()` (every `tickMs`) sends one binary frame with every pose
 * that changed since the last tick, so the server's output is bounded by tick rate × clients, whatever
 * the input rate. Everything else is forwarded as it comes.
 */
export function createRoom({
  scene,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
  tickMs = 100,
  maxClients = 200,
  posesPerSec = 20,
  opsPerSec = 10,
  msgsPerSec = 10,
  maxKeys = 2000,
  maxValueBytes = 4096,
  leaseMs = 5000,
  idleMs = 45000,
  resumeMs = 30000,
  onEmpty = null,
  log = () => {},
} = {}) {
  const clients = new Map();   // id → client
  const ghosts = new Map();    // id → { client, since }
  const state = new Map();     // key → entry
  let seq = 0;
  let nextId = 1;
  let dirty = new Set();       // ids whose pose changed since the last tick
  let stateDirty = false;      // something to persist
  let tickTimer = null, sweepTimer = null;
  let closed = false;
  const stats = { in: 0, out: 0, bytesIn: 0, bytesOut: 0, poses: 0, ops: 0 };

  const token = () => Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');

  function allocId() {
    for (let i = 0; i < 65536; i++) {
      const id = ((nextId + i - 1) % 65535) + 1;
      if (!clients.has(id) && !ghosts.has(id)) { nextId = id + 1; return id; }
    }
    return null;
  }

  function send(client, data) {
    if (client.conn == null) return;
    stats.out++;
    stats.bytesOut += typeof data === 'string' ? data.length : data.byteLength;
    try { client.conn.send(data); } catch (e) { log('send failed', e?.message); }
  }
  const sendJson = (client, msg) => send(client, JSON.stringify(msg));
  function broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const c of clients.values()) if (c !== except) send(c, text);
  }

  const peerOf = c => ({ id: c.id, name: c.name, color: c.color, intent: c.intent });
  const stateSnapshot = () => Object.fromEntries([...state].map(([k, e]) => [k, { value: e.value, seq: e.seq, by: e.by, ...(e.owner != null ? { owner: e.owner, until: e.until } : {}) }]));

  function welcome(client) {
    sendJson(client, {
      t: 'welcome', v: PROTOCOL_VERSION, id: client.id, token: client.token, now: now(), seq, tickMs,
      peers: [...clients.values()].filter(c => c !== client).map(peerOf),
      state: stateSnapshot(),
    });
  }

  /**
   * A connection's first message must be `join`; the room answers `welcome` (or `error` and closes).
   * Returns the client on success. Pass the connection and the raw text of the first frame.
   */
  function join(conn, text) {
    const msg = parseMessage(clientMessage, text);
    const fail = (code, message) => { try { conn.send(JSON.stringify({ t: 'error', code, message })); conn.close(4000, code); } catch { /* gone */ } return null; };
    if (!msg || msg.t !== 'join') return fail(msg ? 'invalid' : 'version', 'the first message must be a join of this protocol version');
    if (msg.scene !== scene) return fail('scene', `this event is for the scene "${scene}"`);
    let client = null;
    const ghost = msg.resume && ghosts.get(msg.resume.id);
    if (ghost && ghost.client.token === msg.resume.token) {
      ghosts.delete(msg.resume.id);
      client = ghost.client;
      client.conn = conn; client.name = msg.name; client.color = msg.color;
      log(`resume ${client.id}`);
    } else {
      if (clients.size >= maxClients) return fail('full', 'this event is full');
      const id = allocId();
      if (id == null) return fail('full', 'this event is full');
      client = { id, token: token(), conn, name: msg.name, color: msg.color, pose: null, flags: 0, intent: null, lastSeen: 0, lastPose: 0, opBudget: opsPerSec, opRefill: 0, msgBudget: msgsPerSec, msgRefill: 0, leases: new Set() };
    }
    client.lastSeen = client.opRefill = client.msgRefill = now();
    clients.set(client.id, client);
    welcome(client);
    broadcast({ t: 'join', peer: peerOf(client) }, client);
    if (!tickTimer) start();
    return client;
  }

  /** A frame from a joined client: binary poses, or JSON for everything else. Unknown or malformed input is dropped. */
  function message(client, data) {
    if (closed || client.conn == null) return;
    const t = now();
    client.lastSeen = t;
    stats.in++;
    if (typeof data !== 'string') {
      stats.bytesIn += data.byteLength;
      const frame = unpackFrame(data);
      if (!frame || frame.type !== 'pose') return;
      if (t - client.lastPose < 1000 / posesPerSec - 5) return; // over the rate: keep the one we have
      client.lastPose = t;
      client.pose = frame.pose;
      dirty.add(client.id);
      stats.poses++;
      return;
    }
    stats.bytesIn += data.length;
    if (data.length > maxValueBytes + 512) { sendJson(client, { t: 'reject', key: '', reason: 'size' }); return; }
    const msg = parseMessage(clientMessage, data);
    if (!msg) return;
    // everything but a ping is forwarded to the whole room, so each client gets a budget for it (ops have their own, below)
    if (msg.t !== 'ping' && msg.t !== 'op' && !takeMsgBudget(client, t)) {
      if (msg.key) sendJson(client, { t: 'reject', key: msg.key, reason: 'limit' });
      return;
    }
    switch (msg.t) {
      case 'ping': sendJson(client, { t: 'pong', c: msg.c, s: t }); break;
      case 'intent': {
        client.intent = { ...msg.intent, at: t };
        client.flags = msg.intent.kind === 'free' ? POSE_FLAGS.FREE : 0;
        if (msg.intent.kind !== 'free') client.pose = null; // peers replay the flight; the next free flight brings poses again
        broadcast({ t: 'intent', id: client.id, intent: client.intent }, client);
        break;
      }
      case 'profile': {
        if (msg.name) client.name = msg.name;
        if (msg.color) client.color = msg.color;
        broadcast({ t: 'profile', id: client.id, name: client.name, color: client.color });
        break;
      }
      case 'op': op(client, msg, t); break;
      case 'grab': grab(client, msg.key, t); break;
      case 'drop': drop(client, msg.key, true); break;
      default: break;
    }
  }

  function takeMsgBudget(client, t) {
    client.msgBudget = Math.min(msgsPerSec, client.msgBudget + ((t - client.msgRefill) / 1000) * msgsPerSec);
    client.msgRefill = t;
    if (client.msgBudget < 1) return false;
    client.msgBudget -= 1;
    return true;
  }

  function takeOpBudget(client, t) {
    client.opBudget = Math.min(opsPerSec, client.opBudget + ((t - client.opRefill) / 1000) * opsPerSec);
    client.opRefill = t;
    if (client.opBudget < 1) return false;
    client.opBudget -= 1;
    return true;
  }

  function leaseHolder(key, t) {
    const e = state.get(key);
    if (!e || e.owner == null) return null;
    if (e.until <= t) { release(key, e); return null; }
    return e.owner;
  }

  function release(key, e, announce = true) {
    const owner = e.owner;
    e.owner = null; e.until = undefined;
    clients.get(owner)?.leases.delete(key);
    ghosts.get(owner)?.client.leases.delete(key);
    if (e.seq === 0 && state.get(key) === e) state.delete(key); // only ever grabbed, never written: nothing to keep
    if (announce) broadcast({ t: 'lease', key, owner: null });
  }

  function op(client, msg, t) {
    const size = JSON.stringify(msg.value ?? null).length;
    if (size > maxValueBytes) { sendJson(client, { t: 'reject', key: msg.key, reason: 'size' }); return; }
    if (!takeOpBudget(client, t)) { sendJson(client, { t: 'reject', key: msg.key, reason: 'limit' }); return; }
    const holder = leaseHolder(msg.key, t);
    const e = state.get(msg.key);
    if (!e && state.size >= maxKeys) { sendJson(client, { t: 'reject', key: msg.key, reason: 'limit' }); return; }
    if (holder != null && holder !== client.id) { sendJson(client, { t: 'reject', key: msg.key, reason: 'leased', seq: e.seq, value: e.value }); return; }
    // `base` lets a client ask for compare-and-set: the op only lands on the version it saw
    if (msg.base != null && e && e.seq !== msg.base) { sendJson(client, { t: 'reject', key: msg.key, reason: 'stale', seq: e.seq, value: e.value }); return; }
    seq++;
    const entry = e ?? { value: undefined, seq: 0, by: null, owner: null, until: undefined };
    entry.value = msg.value; entry.seq = seq; entry.by = client.id;
    if (holder === client.id) entry.until = t + leaseMs; // an op refreshes the holder's lease
    state.set(msg.key, entry);
    stateDirty = true;
    stats.ops++;
    broadcast({ t: 'state', key: msg.key, value: msg.value, seq, by: client.id });
  }

  function grab(client, key, t) {
    const holder = leaseHolder(key, t);
    let e = state.get(key);
    if (!e && state.size >= maxKeys) { sendJson(client, { t: 'reject', key, reason: 'limit' }); return; }
    if (holder != null && holder !== client.id) { sendJson(client, { t: 'reject', key, reason: 'leased', seq: e.seq, value: e.value }); return; }
    if (!e) { e = { value: undefined, seq: 0, by: null, owner: null, until: undefined }; state.set(key, e); }
    e.owner = client.id; e.until = t + leaseMs;
    client.leases.add(key);
    broadcast({ t: 'lease', key, owner: client.id, until: e.until });
  }

  function drop(client, key, announce) {
    const e = state.get(key);
    if (!e || e.owner !== client.id) return;
    release(key, e, announce);
  }

  /** The transport saw the client alive (a WebSocket pong): it is not idle, whatever it sent. */
  function touch(client) { client.lastSeen = now(); }

  /** The connection went away: keep the client as a ghost for a while, so it can resume; its peers hear `leave` only when it is forgotten. */
  function leave(client) {
    if (!clients.has(client.id)) return;
    clients.delete(client.id);
    dirty.delete(client.id);
    client.conn = null;
    ghosts.set(client.id, { client, since: now() });
    // an avatar nobody steers should not stay on screen: tell the peers it is gone; a resume brings a fresh join
    broadcast({ t: 'leave', id: client.id });
    for (const key of [...client.leases]) drop(client, key, true);
    if (!clients.size) onEmpty?.();
  }

  /** Drops a client for good (a resume after this is a new join). */
  function forget(id) {
    const g = ghosts.get(id);
    if (!g) return;
    ghosts.delete(id);
    for (const key of [...g.client.leases]) { const e = state.get(key); if (e?.owner === id) release(key, e); }
  }

  /** Sends every changed pose in one frame. Called by the room's own timer; callable by hand under test. */
  function tick() {
    const t = now();
    if (dirty.size) {
      const entries = [];
      for (const id of dirty) { const c = clients.get(id); if (c?.pose) entries.push({ id, pose: c.pose, flags: c.flags }); }
      dirty = new Set();
      if (entries.length) {
        const frame = packPoses(entries);
        for (const c of clients.values()) send(c, frame);
      }
    }
    // expired leases go back to nobody (a grab with no ops and no drop)
    for (const [key, e] of state) if (e.owner != null && e.until <= t) release(key, e);
  }

  /** Drops silent connections and forgets old ghosts. */
  function sweep() {
    const t = now();
    for (const c of [...clients.values()]) {
      if (t - c.lastSeen > idleMs) { log(`idle ${c.id}`); try { c.conn?.close(4001, 'idle'); } catch { /* gone */ } leave(c); }
    }
    for (const [id, g] of [...ghosts]) if (t - g.since > resumeMs) forget(id);
  }

  function start() {
    if (closed) return;
    const loop = () => { tickTimer = setTimer(loop, tickMs); tick(); };
    const sweeper = () => { sweepTimer = setTimer(sweeper, Math.min(idleMs, 2000)); sweep(); };
    tickTimer = setTimer(loop, tickMs);
    sweepTimer = setTimer(sweeper, Math.min(idleMs, 2000));
  }

  function close() {
    closed = true;
    if (tickTimer) clearTimer(tickTimer);
    if (sweepTimer) clearTimer(sweepTimer);
    tickTimer = sweepTimer = null;
    for (const c of [...clients.values()]) { try { c.conn?.close(1001, 'closing'); } catch { /* gone */ } }
    clients.clear(); ghosts.clear();
  }

  /** The shared state (not the clients) for persistence; `restore` takes the same shape, without leases. */
  const snapshot = () => ({ scene, seq, state: Object.fromEntries([...state].map(([k, e]) => [k, { value: e.value, seq: e.seq, by: e.by }])) });
  function restore(snap) {
    if (!snap || snap.scene !== scene) return false;
    state.clear();
    for (const [k, e] of Object.entries(snap.state ?? {})) state.set(k, { value: e.value, seq: e.seq ?? 0, by: e.by ?? null, owner: null, until: undefined });
    seq = Math.max(seq, snap.seq ?? 0);
    return true;
  }
  const takeDirty = () => { const d = stateDirty; stateDirty = false; return d; };

  return {
    scene, join, message, touch, leave, forget, tick, sweep, close, snapshot, restore, takeDirty,
    get size() { return clients.size; },
    get seq() { return seq; },
    get stats() { return { ...stats, clients: clients.size, ghosts: ghosts.size, keys: state.size }; },
    /** Read-only looks for tests and the server's status page. */
    client: id => clients.get(id) ?? null,
    entry: key => state.get(key) ?? null,
  };
}
