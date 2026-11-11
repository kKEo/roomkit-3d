import {
  PROTOCOL_VERSION, serverMessage, parseMessage, packPose, unpackFrame, gazeOf,
} from './protocol.js';

/**
 * The viewer's end of the sync protocol: one WebSocket to one event, reconnecting by itself, with
 * the room's view of the other visitors (`peers`) and of the shared state (`shared`). No React and no
 * browser globals (the WebSocket class, the clock and the timers are injected), so it runs under test.
 *
 * - `peers`: id → `{ id, name, color, intent, samples, flags }`. `intent` is the peer's latest flight
 *   (stamped with the server time it started); `samples` the last few poses received while it flies by
 *   hand, each with the local time of arrival, for interpolation (src/scene/Avatars.jsx).
 * - `shared`: key → `{ value, seq, by, owner?, until? }`, applied in the server's order.
 * - `serverNow()`: the server's clock, from the round trips of the pings (median offset).
 *
 * Listeners (`subscribe`) are called with an event name: 'status', 'peers' (join / leave / profile),
 * 'intent' (id), 'poses', 'state' (key), 'lease' (key), 'reject' (message). Poses arrive many times a
 * second; everything else rarely.
 */
export function createSyncClient({
  url, event, scene, profile,
  WebSocket: WS, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  storage = null, log = console.warn, pingMs = 2000, poseMs = 66, maxSamples = 8,
}) {
  const peers = new Map();
  const shared = new Map();
  const subs = new Set();
  const stats = { in: 0, out: 0, bytesIn: 0, bytesOut: 0, rtt: null };
  let ws = null, status = 'idle', me = null, seq = 0, tickMs = 100;
  let attempts = 0, retryTimer = null, pingTimer = null, closed = false;
  let offsets = [];
  let lastPoseAt = 0, lastPose = null;
  let onWelcome = null;

  const emit = (what, arg) => { for (const cb of [...subs]) cb(what, arg); };
  const setStatus = s => { if (status !== s) { status = s; emit('status', s); } };
  const resumeKey = `sync:${event}`;
  const loadResume = () => { try { const v = storage?.getItem(resumeKey); return v ? JSON.parse(v) : null; } catch { return null; } };
  const saveResume = r => { try { storage?.setItem(resumeKey, JSON.stringify(r)); } catch { /* private mode */ } };

  function send(data) {
    if (!ws || ws.readyState !== 1) return false;
    stats.out++; stats.bytesOut += typeof data === 'string' ? data.length : data.byteLength;
    ws.send(data);
    return true;
  }
  const sendJson = msg => send(JSON.stringify(msg));

  function connect() {
    if (closed || ws) return;
    setStatus(attempts ? 'reconnecting' : 'connecting');
    let sock;
    try { sock = new WS(`${url.replace(/\/$/, '')}/ws/${encodeURIComponent(event)}`); } catch (e) { log(`sync: ${e.message}`); schedule(); return; }
    sock.binaryType = 'arraybuffer';
    ws = sock;
    sock.onopen = () => {
      const resume = loadResume();
      sendJson({ t: 'join', v: PROTOCOL_VERSION, scene, name: profile.name, color: profile.color, ...(resume ? { resume } : {}) });
    };
    sock.onmessage = ev => receive(ev.data);
    sock.onerror = () => { /* onclose follows */ };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (pingTimer) { clearTimer(pingTimer); pingTimer = null; }
      for (const p of peers.values()) p.samples.length = 0;
      peers.clear();
      emit('peers');
      if (closed) { setStatus('closed'); return; }
      setStatus('reconnecting');
      schedule();
    };
  }

  function schedule() {
    if (closed || retryTimer) return;
    const delay = Math.min(15000, 500 * 2 ** Math.min(5, attempts)) * (0.8 + 0.4 * Math.random());
    attempts++;
    retryTimer = setTimer(() => { retryTimer = null; connect(); }, delay);
  }

  function ping() {
    sendJson({ t: 'ping', c: now() });
    pingTimer = setTimer(ping, pingMs);
  }

  function receive(data) {
    stats.in++;
    if (typeof data !== 'string') {
      stats.bytesIn += data.byteLength;
      const frame = unpackFrame(data);
      if (!frame || frame.type !== 'poses') return;
      const t = now();
      for (const { id, pose, flags } of frame.entries) {
        if (me && id === me.id) continue;
        const p = peers.get(id);
        if (!p) continue;
        p.flags = flags;
        p.samples.push({ t, pose });
        if (p.samples.length > maxSamples) p.samples.shift();
      }
      emit('poses');
      return;
    }
    stats.bytesIn += data.length;
    const msg = parseMessage(serverMessage, data);
    if (!msg) { log('sync: unknown message', data.slice(0, 80)); return; }
    switch (msg.t) {
      case 'welcome': {
        attempts = 0;
        me = { id: msg.id, name: profile.name, color: profile.color };
        saveResume({ id: msg.id, token: msg.token });
        seq = msg.seq; tickMs = msg.tickMs;
        offsets = [msg.now - now()];
        peers.clear();
        for (const peer of msg.peers) peers.set(peer.id, { ...peer, samples: [], flags: 0 });
        shared.clear();
        for (const [k, e] of Object.entries(msg.state)) shared.set(k, e);
        setStatus('online');
        emit('peers'); emit('state');
        if (pingTimer) clearTimer(pingTimer);
        pingTimer = setTimer(ping, 200);
        onWelcome?.();
        break;
      }
      case 'join': peers.set(msg.peer.id, { ...msg.peer, samples: [], flags: 0 }); emit('peers'); break;
      case 'leave': peers.delete(msg.id); emit('peers'); break;
      case 'profile': { const p = peers.get(msg.id); if (p) { p.name = msg.name; p.color = msg.color; emit('peers'); } break; }
      case 'intent': { const p = peers.get(msg.id); if (p) { p.intent = msg.intent; p.samples.length = 0; emit('intent', msg.id); } break; }
      case 'state': {
        if (msg.seq <= seq && shared.has(msg.key) && shared.get(msg.key).seq >= msg.seq) break; // already applied (a resume replayed it)
        seq = Math.max(seq, msg.seq);
        const e = shared.get(msg.key) ?? {};
        shared.set(msg.key, { ...e, value: msg.value, seq: msg.seq, by: msg.by });
        emit('state', msg.key);
        break;
      }
      case 'lease': {
        const e = shared.get(msg.key) ?? { value: undefined, seq: 0, by: null };
        shared.set(msg.key, { ...e, owner: msg.owner, until: msg.until });
        emit('lease', msg.key);
        break;
      }
      case 'reject': emit('reject', msg); break;
      case 'pong': {
        const rtt = now() - msg.c;
        stats.rtt = rtt;
        offsets.push(msg.s + rtt / 2 - now());
        if (offsets.length > 9) offsets.shift();
        break;
      }
      case 'error': log(`sync: ${msg.code}: ${msg.message}`); if (msg.code === 'version' || msg.code === 'scene') close(); break;
      default: break;
    }
  }

  /** The server's clock (ms), as far as the pings tell. */
  function serverNow() {
    if (!offsets.length) return now();
    const s = [...offsets].sort((a, b) => a - b);
    return now() + s[s.length >> 1];
  }

  /** Report a flight (an intent object, see protocol.js); kept so it is resent after a reconnect. */
  let myIntent = null;
  function intent(i) {
    myIntent = i;
    lastPose = null;
    return sendJson({ t: 'intent', intent: i });
  }
  /** Report the camera pose while flying by hand; throttled, and skipped when nothing moved. */
  function pose(position, target) {
    const t = now();
    if (t - lastPoseAt < poseMs) return false;
    if (lastPose && Math.hypot(position[0] - lastPose.position[0], position[1] - lastPose.position[1], position[2] - lastPose.position[2]) < 0.005
      && Math.hypot(target[0] - lastPose.target[0], target[1] - lastPose.target[1], target[2] - lastPose.target[2]) < 0.005) return false;
    lastPoseAt = t;
    lastPose = { position: [...position], target: [...target] };
    const { yaw, pitch } = gazeOf(position, target);
    return send(packPose({ position, yaw, pitch }));
  }

  /** Reconnect right away (the page became visible again) instead of waiting out the backoff; online, just ping. */
  function retryNow() {
    if (closed) return;
    if (ws && ws.readyState === 1) { sendJson({ t: 'ping', c: now() }); return; }
    if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
    if (!ws) connect();
  }

  function close() {
    closed = true;
    if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
    if (pingTimer) { clearTimer(pingTimer); pingTimer = null; }
    const sock = ws; ws = null;
    try { sock?.close(1000, 'bye'); } catch { /* already gone */ }
    peers.clear();
    setStatus('closed');
  }

  return {
    connect, close, retryNow, intent, pose, serverNow, peers, shared,
    op: (key, value, base) => sendJson({ t: 'op', key, value, ...(base != null ? { base } : {}) }),
    grab: key => sendJson({ t: 'grab', key }),
    drop: key => sendJson({ t: 'drop', key }),
    setProfile: ({ name, color }) => {
      if (name) profile.name = name;
      if (color) profile.color = color;
      if (me) { me = { ...me, name: profile.name, color: profile.color }; }
      return sendJson({ t: 'profile', ...(name ? { name } : {}), ...(color ? { color } : {}) });
    },
    subscribe: cb => { subs.add(cb); return () => subs.delete(cb); },
    /** Called after every welcome (first connection and each reconnect): resend where this visitor is. */
    onWelcome: cb => { onWelcome = cb; },
    get status() { return status; },
    get me() { return me; },
    get seq() { return seq; },
    get tickMs() { return tickMs; },
    get stats() { return { ...stats, peers: peers.size }; },
    get lastIntent() { return myIntent; },
  };
}
