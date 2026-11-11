import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createRoom } from './room.js';

/**
 * The sync server: one process, one room per event, over `ws`. Clients connect to
 * `ws://host:PORT/ws/<event>` and send a `join` naming the scene; the first join of an event decides
 * which scene it is for. See docs/guide/operator/deploy/sync-server.md for running it.
 *
 * Environment:
 *   PORT        listen port (default 8787)
 *   HOST        bind address (default 0.0.0.0)
 *   ORIGINS     comma-separated page origins allowed to connect (default: any)
 *   TICK_HZ     pose broadcast rate (default 10)
 *   MAX_CLIENTS per event (default 200)
 *   STATE_DIR   directory for per-event state snapshots (default: none, state lives in memory only)
 *   EMPTY_TTL_MS how long an event nobody is in stays open, with its state (default 60000)
 *   LOG         "debug" for per-client messages
 */
const env = (k, d) => (process.env[k] == null || process.env[k] === '' ? d : process.env[k]);
const PORT = +env('PORT', 8787);
const HOST = env('HOST', '0.0.0.0');
const ORIGINS = env('ORIGINS', '').split(',').map(s => s.trim()).filter(Boolean);
const TICK_MS = Math.round(1000 / Math.max(1, +env('TICK_HZ', 10)));
const MAX_CLIENTS = +env('MAX_CLIENTS', 200);
const STATE_DIR = env('STATE_DIR', '');
const DEBUG = env('LOG', '') === 'debug';
const EVENT_NAME = /^[a-z0-9][a-z0-9-_]{0,63}$/i;
const MAX_MESSAGE = 16 * 1024;
const EMPTY_TTL = +env('EMPTY_TTL_MS', 60000); // an empty event (nobody left to resume) is dropped after this

const log = (...a) => console.log(new Date().toISOString(), ...a);
const debug = DEBUG ? log : () => {};

const rooms = new Map(); // event → { room, timer }

function snapshotPath(event) { return path.join(STATE_DIR, `${event}.json`); }

function roomFor(event, scene) {
  let r = rooms.get(event);
  if (r) { if (r.timer) { clearTimeout(r.timer); r.timer = null; } return r.room; }
  const room = createRoom({
    scene, tickMs: TICK_MS, maxClients: MAX_CLIENTS, log: (...a) => debug(`[${event}]`, ...a),
    onEmpty: () => {
      const e = rooms.get(event);
      if (!e) return;
      if (e.timer) clearTimeout(e.timer);
      e.timer = setTimeout(() => {
        e.timer = null;
        if (room.size) return; // someone came back in the meantime
        persist(event, room); room.close(); rooms.delete(event); log(`event ${event}: closed (empty)`);
      }, EMPTY_TTL);
    },
  });
  if (STATE_DIR) {
    try { room.restore(JSON.parse(fs.readFileSync(snapshotPath(event), 'utf8'))); log(`event ${event}: state restored`); } catch { /* none yet */ }
  }
  rooms.set(event, { room, timer: null });
  log(`event ${event}: opened for scene ${scene}`);
  return room;
}

function persist(event, room) {
  if (!STATE_DIR || !room.takeDirty()) return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const file = snapshotPath(event);
    fs.writeFileSync(file + '.tmp', JSON.stringify(room.snapshot()));
    fs.renameSync(file + '.tmp', file);
  } catch (e) { log(`event ${event}: could not persist state: ${e.message}`); }
}
if (STATE_DIR) setInterval(() => { for (const [event, { room }] of rooms) persist(event, room); }, 10000).unref();

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (req.url === '/status') {
    const body = Object.fromEntries([...rooms].map(([event, { room }]) => [event, { scene: room.scene, ...room.stats }]));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_MESSAGE,
  perMessageDeflate: false, // frames are tiny; compression would cost more CPU than bytes
});

server.on('upgrade', (req, socket, head) => {
  const m = /^\/ws\/([^/?#]+)/.exec(req.url || '');
  const origin = req.headers.origin;
  // a malformed escape (/ws/%E0%A4%A) makes decodeURIComponent throw: that is a bad name, not a reason to die
  let event = '';
  try { event = decodeURIComponent(m?.[1] ?? ''); } catch { /* not a name */ }
  if (!EVENT_NAME.test(event)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  if (ORIGINS.length && !ORIGINS.includes(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, event));
});

wss.on('connection', (ws, req, event) => {
  ws.binaryType = 'arraybuffer';
  let client = null, room = null;
  const conn = {
    send: data => { if (ws.readyState === ws.OPEN) ws.send(data); },
    close: (code, reason) => ws.close(code, reason),
  };
  // the first frame is the join (text); anything else is refused
  const joinTimer = setTimeout(() => { if (!client) ws.close(4002, 'no join'); }, 5000);
  ws.on('pong', () => { if (client && room) room.touch(client); });
  ws.on('message', (data, isBinary) => {
    if (!client) {
      clearTimeout(joinTimer);
      if (isBinary) { ws.close(4000, 'invalid'); return; }
      const text = data.toString();
      let scene;
      try { scene = JSON.parse(text)?.scene; } catch { /* the room reports it */ }
      // an event that is still open is joined through roomFor too: that is what calls off its closing when it was empty
      room = rooms.has(event) || (typeof scene === 'string' && scene) ? roomFor(event, scene) : null;
      if (!room) { ws.send(JSON.stringify({ t: 'error', code: 'invalid', message: 'the join must name a scene' })); ws.close(4000, 'invalid'); return; }
      client = room.join(conn, text);
      if (client) debug(`[${event}] join ${client.id} ${client.name} from ${req.socket.remoteAddress} (${room.size} online)`);
      return;
    }
    room.message(client, isBinary ? data : data.toString());
  });
  ws.on('close', () => { clearTimeout(joinTimer); if (client && room) { room.leave(client); debug(`[${event}] left ${client.id} (${room.size} online)`); } });
  ws.on('error', e => debug(`[${event}] socket error: ${e.message}`));
});

// Transport-level liveness: a pong counts as "still here" for the room too, so a page whose timers the
// browser throttles (a background tab) keeps its place; a dead peer is noticed within half a minute.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

function shutdown(signal) {
  log(`${signal}: shutting down`);
  clearInterval(heartbeat);
  for (const [event, { room, timer }] of rooms) { if (timer) clearTimeout(timer); persist(event, room); room.close(); }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => log(`sync server listening on ${HOST}:${PORT} (tick ${TICK_MS} ms, max ${MAX_CLIENTS} clients/event${ORIGINS.length ? `, origins ${ORIGINS.join(' ')}` : ''}${STATE_DIR ? `, state in ${STATE_DIR}` : ''})`));
