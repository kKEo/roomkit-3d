import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncClient } from '../src/net/client.js';
import { packPoses, unpackFrame, PROTOCOL_VERSION } from '../src/net/protocol.js';

/** A fake WebSocket class that records what was sent and lets the test play the server. */
function fakeSockets() {
  const all = [];
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; all.push(this); }
    send(d) { this.sent.push(d); }
    close(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); }
    // the test's side
    open() { this.readyState = 1; this.onopen?.(); }
    serve(msg) { this.onmessage?.({ data: typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg) }); }
    drop() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
    json() { return this.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d)); }
  }
  return { WS, all };
}

function clock() {
  let t = 10000, n = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++n; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: id => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        t = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      t = end;
    },
    /** Time passes with no timer running (a sleeping laptop, a throttled background tab); then each due timer runs once. */
    jump(ms) {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); }
    },
  };
}

const storage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const welcome = (id = 7, extra = {}) => ({ t: 'welcome', v: PROTOCOL_VERSION, id, token: 'tok-tok-tok', now: 50000, seq: 3, tickMs: 100, peers: [{ id: 2, name: 'Bob', color: '#ff0000', intent: null }], state: { 'lamp.on': { value: true, seq: 3, by: 2 } }, ...extra });

let ck, sockets, client, events, store;
beforeEach(() => {
  ck = clock(); sockets = fakeSockets(); store = storage(); events = [];
  client = createSyncClient({ url: 'ws://x', event: 'demo', scene: 'loft', profile: { name: 'Ada', color: '#00ff66' }, WebSocket: sockets.WS, storage: store, now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer, log: () => {} });
  client.subscribe((what, arg) => events.push([what, arg]));
});

describe('connecting', () => {
  it('joins on open, takes the welcome and starts pinging', () => {
    client.connect();
    const s = sockets.all[0];
    expect(s.url).toBe('ws://x/ws/demo');
    expect(client.status).toBe('connecting');
    s.open();
    expect(s.json()[0]).toEqual({ t: 'join', v: PROTOCOL_VERSION, scene: 'loft', name: 'Ada', color: '#00ff66' });
    s.serve(welcome());
    expect(client.status).toBe('online');
    expect(client.me).toEqual({ id: 7, name: 'Ada', color: '#00ff66' });
    expect([...client.peers.keys()]).toEqual([2]);
    expect(client.shared.get('lamp.on')).toMatchObject({ value: true, seq: 3 });
    expect(JSON.parse(store.getItem('sync:demo'))).toEqual({ id: 7, token: 'tok-tok-tok' });
    ck.advance(200);
    expect(s.json().at(-1)).toEqual({ t: 'ping', c: ck.now() });
  });

  it('reconnects with backoff and offers to resume', () => {
    client.connect();
    const s1 = sockets.all[0];
    s1.open(); s1.serve(welcome());
    s1.drop();
    expect(client.status).toBe('reconnecting');
    expect(client.peers.size).toBe(0);
    expect(sockets.all.length).toBe(1);
    ck.advance(800);
    expect(sockets.all.length).toBe(2);
    const s2 = sockets.all[1];
    s2.open();
    expect(s2.json()[0].resume).toEqual({ id: 7, token: 'tok-tok-tok' });
    s2.drop();
    ck.advance(400);
    expect(sockets.all.length).toBe(2); // second retry waits longer
    ck.advance(1200);
    expect(sockets.all.length).toBe(3);
  });

  it('close() stops everything and no reconnect follows', () => {
    client.connect();
    sockets.all[0].open();
    client.close();
    expect(client.status).toBe('closed');
    ck.advance(60000);
    expect(sockets.all.length).toBe(1);
  });
});

describe('peers and poses', () => {
  const online = () => { client.connect(); const s = sockets.all[0]; s.open(); s.serve(welcome()); events.length = 0; return s; };

  it('tracks joins, leaves, profiles and intents', () => {
    const s = online();
    s.serve({ t: 'join', peer: { id: 3, name: 'Cy', color: '#0000ff', intent: null } });
    expect(client.peers.get(3).name).toBe('Cy');
    s.serve({ t: 'profile', id: 3, name: 'Cyd', color: '#0000ff' });
    expect(client.peers.get(3).name).toBe('Cyd');
    const view = { position: [0, 0, 0], target: [0, 0, 1] };
    s.serve({ t: 'intent', id: 3, intent: { kind: 'poi', from: view, to: view, poi: 'a', at: 50100 } });
    expect(client.peers.get(3).intent.poi).toBe('a');
    s.serve({ t: 'leave', id: 3 });
    expect(client.peers.has(3)).toBe(false);
    expect(events.map(e => e[0])).toEqual(['peers', 'peers', 'intent', 'peers']);
  });

  it('keeps a short buffer of pose samples per peer, ignoring its own and unknown ids', () => {
    const s = online();
    const pose = x => ({ position: [x, 1, 0], yaw: 0, pitch: 0 });
    for (let i = 0; i < 12; i++) { s.serve(packPoses([{ id: 2, pose: pose(i), flags: 1 }, { id: 7, pose: pose(0) }, { id: 99, pose: pose(0) }])); ck.advance(100); }
    const p = client.peers.get(2);
    expect(p.samples.length).toBe(8);
    expect(p.samples.at(-1).pose.position[0]).toBeCloseTo(11, 2);
    expect(p.flags).toBe(1);
    expect(events.filter(e => e[0] === 'poses').length).toBe(12);
  });

  it('sends its own pose throttled and only when it moved, and resends intents', () => {
    const s = online();
    expect(client.pose([0, 1, 0], [0, 1, -1])).toBe(true);
    expect(client.pose([5, 1, 0], [0, 1, -1])).toBe(false); // too soon
    ck.advance(100);
    expect(client.pose([0, 1, 0], [0, 1, -1])).toBe(false); // did not move
    expect(client.pose([0.5, 1, 0], [0, 1, -1])).toBe(true);
    const bins = s.sent.filter(d => typeof d !== 'string').map(unpackFrame);
    expect(bins.length).toBe(2);
    expect(bins[1].pose.position[0]).toBeCloseTo(0.5, 2);
    const view = { position: [0, 0, 0], target: [0, 0, 1] };
    client.intent({ kind: 'still', from: view });
    expect(s.json().at(-1)).toEqual({ t: 'intent', intent: { kind: 'still', from: view } });
    expect(client.lastIntent.kind).toBe('still');
  });
});

describe('shared state and clock', () => {
  const online = () => { client.connect(); const s = sockets.all[0]; s.open(); s.serve(welcome()); events.length = 0; return s; };

  it('applies state in order and ignores replays, tracks leases and rejects', () => {
    const s = online();
    s.serve({ t: 'state', key: 'lamp.on', value: false, seq: 4, by: 2 });
    expect(client.shared.get('lamp.on')).toMatchObject({ value: false, seq: 4 });
    s.serve({ t: 'state', key: 'lamp.on', value: true, seq: 3, by: 2 }); // old
    expect(client.shared.get('lamp.on').value).toBe(false);
    s.serve({ t: 'lease', key: 'box', owner: 2, until: 60000 });
    expect(client.shared.get('box')).toMatchObject({ owner: 2, until: 60000 });
    s.serve({ t: 'reject', key: 'box', reason: 'leased' });
    expect(events.at(-1)[0]).toBe('reject');
    client.op('lamp.on', true, 4);
    expect(s.json().at(-1)).toEqual({ t: 'op', key: 'lamp.on', value: true, base: 4 });
    client.grab('box'); client.drop('box');
    expect(s.json().slice(-2).map(m => m.t)).toEqual(['grab', 'drop']);
  });

  it('estimates the server clock from the pongs', () => {
    const s = online();
    expect(client.serverNow()).toBe(ck.now() + 40000); // from the welcome alone
    ck.advance(200);
    const ping = s.json().at(-1);
    ck.advance(40); // 40 ms round trip
    s.serve({ t: 'pong', c: ping.c, s: ping.c + 40000 + 20 });
    expect(client.stats.rtt).toBe(40);
    expect(client.serverNow()).toBe(ck.now() + 40000);
  });
});

describe('a connection that went silent', () => {
  const online = () => { client.connect(); const s = sockets.all[0]; s.open(); s.serve(welcome()); return s; };
  /** The server answers every ping, as it does when the network is fine. */
  const answer = s => { const p = s.json().filter(m => m.t === 'ping').at(-1); s.serve({ t: 'pong', c: p.c, s: p.c + 40000 }); };

  it('is replaced when pings go unanswered, although the socket never reports closing', () => {
    const s = online();
    s.close = () => {}; // a half-open socket: close() does nothing visible, no onclose follows
    ck.advance(2000 * 4); // pings go out, nothing comes back
    expect(client.status).toBe('online');
    ck.advance(2000 * 3);
    expect(client.status).toBe('reconnecting');
    expect(client.peers.size).toBe(0);
    ck.advance(1000);
    expect(sockets.all.length).toBe(2); // and a new connection is being made
  });

  it('closes the dead socket with 4003 so it does not linger', () => {
    const s = online();
    const close = vi.fn(); s.close = close;
    ck.advance(2000 * 8);
    expect(close).toHaveBeenCalledWith(4003, 'timeout');
  });

  it('stays online while the pongs come back', () => {
    const s = online();
    for (let i = 0; i < 20; i++) { ck.advance(2000); answer(s); }
    expect(client.status).toBe('online');
    expect(sockets.all.length).toBe(1);
  });

  it('is not mistaken for dead when its timers were slowed down, as in a background tab', () => {
    const s = online();
    ck.advance(2200); answer(s);
    ck.jump(60000); // one timer tick a minute: the last ping was answered, the next goes out now
    expect(client.status).toBe('online');
    answer(s);
    ck.jump(60000);
    expect(client.status).toBe('online');
  });

  it('checks within seconds when the page wakes up and the answer does not come', () => {
    const s = online();
    s.close = () => {};
    ck.advance(300); answer(s);
    ck.jump(30000); // asleep: no timers ran, then the next ping goes out and is lost with the network
    client.retryNow();
    expect(client.status).toBe('online'); // asked, waiting
    ck.advance(3200);
    expect(client.status).toBe('reconnecting');
  });

  it('keeps the connection when the page wakes up and the server answers', () => {
    const s = online();
    ck.advance(300); answer(s);
    ck.jump(30000);
    client.retryNow();
    answer(s);
    ck.advance(5000);
    expect(client.status).toBe('online');
  });
});

describe('retryNow', () => {
  it('reconnects at once while backing off, and just pings when online', () => {
    client.connect();
    const s1 = sockets.all[0];
    s1.open(); s1.serve(welcome());
    client.retryNow();
    expect(s1.json().at(-1).t).toBe('ping');
    s1.drop();
    expect(sockets.all.length).toBe(1);
    client.retryNow();
    expect(sockets.all.length).toBe(2);
  });
});
