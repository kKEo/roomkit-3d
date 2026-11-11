import { describe, it, expect, beforeEach } from 'vitest';
import { createRoom } from '../server/room.js';
import { packPose, unpackFrame, PROTOCOL_VERSION } from '../src/net/protocol.js';

/** A fake clock with timers, so ticks and sweeps run when the test says. */
function clock() {
  let t = 1000, n = 0;
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
  };
}

function conn() {
  const c = { sent: [], closed: null, send: d => c.sent.push(d), close: (code, reason) => { c.closed = { code, reason }; } };
  c.json = () => c.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d));
  c.frames = () => c.sent.filter(d => typeof d !== 'string').map(unpackFrame);
  c.last = () => c.json().at(-1);
  c.clear = () => { c.sent.length = 0; };
  return c;
}

const JOIN = (name = 'Ada', extra = {}) => JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, scene: 'loft', name, color: '#00ff66', ...extra });
const msg = m => JSON.stringify(m);
const view = (x = 0) => ({ position: [x, 2, 10], target: [x, 1, 0] });

let ck, room;
beforeEach(() => {
  ck = clock();
  room = createRoom({ scene: 'loft', now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer, random: () => 0.5, tickMs: 100, idleMs: 10000, resumeMs: 30000, leaseMs: 5000, opsPerSec: 10, posesPerSec: 20 });
});

describe('join', () => {
  it('welcomes with an id, a token, the peers and the state, and tells the others', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada'));
    expect(a.last()).toMatchObject({ t: 'welcome', id: ca.id, seq: 0, tickMs: 100, peers: [], state: {} });
    const cb = room.join(b, JOIN('Bob'));
    expect(b.last().peers).toEqual([{ id: ca.id, name: 'Ada', color: '#00ff66', intent: null }]);
    expect(a.last()).toMatchObject({ t: 'join', peer: { id: cb.id, name: 'Bob' } });
    expect(room.size).toBe(2);
  });

  it('refuses a wrong first message, a wrong scene and a full room', () => {
    const a = conn();
    expect(room.join(a, msg({ t: 'ping', c: 1 }))).toBe(null);
    expect(a.last()).toMatchObject({ t: 'error', code: 'invalid' });
    expect(a.closed.code).toBe(4000);
    const b = conn();
    expect(room.join(b, JOIN('Bob', { scene: 'other' }))).toBe(null);
    expect(b.last().code).toBe('scene');
    const small = createRoom({ scene: 'loft', now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer, maxClients: 1 });
    small.join(conn(), JOIN('x'));
    const c = conn();
    expect(small.join(c, JOIN('y'))).toBe(null);
    expect(c.last().code).toBe('full');
  });
});

describe('poses', () => {
  it('batches changed poses per tick, rate-limits a chatty client and does not echo to nobody', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.join(b, JOIN('Bob'));
    a.clear(); b.clear();
    room.message(ca, packPose({ position: [1, 2, 3], yaw: 0.5, pitch: 0 }));
    ck.advance(10);
    room.message(ca, packPose({ position: [9, 9, 9], yaw: 0.5, pitch: 0 })); // too soon: dropped
    expect(b.frames()).toEqual([]);
    ck.advance(100);
    const f = b.frames();
    expect(f.length).toBe(1);
    expect(f[0].entries).toHaveLength(1);
    expect(f[0].entries[0].id).toBe(ca.id);
    expect(f[0].entries[0].pose.position).toEqual([1, 2, 3]);
    // nothing changed: the next tick sends nothing
    ck.advance(100);
    expect(b.frames().length).toBe(1);
  });
});

describe('intents', () => {
  it('forwards a flight intent stamped with the server time and keeps it for late joiners', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.join(b, JOIN('Bob'));
    b.clear();
    room.message(ca, msg({ t: 'intent', intent: { kind: 'poi', from: view(0), to: view(5), poi: 'desk', duration: 1500 } }));
    expect(b.last()).toMatchObject({ t: 'intent', id: ca.id, intent: { kind: 'poi', poi: 'desk', at: ck.now() } });
    const c = conn();
    room.join(c, JOIN('Cy'));
    expect(c.last().peers.find(p => p.id === ca.id).intent).toMatchObject({ kind: 'poi', poi: 'desk' });
  });
});

describe('shared state', () => {
  it('orders ops with one sequence, last writer wins, and late joiners get the snapshot', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada')), cb = room.join(b, JOIN('Bob'));
    room.message(ca, msg({ t: 'op', key: 'lamp.on', value: true }));
    room.message(cb, msg({ t: 'op', key: 'lamp.on', value: false }));
    const states = a.json().filter(m => m.t === 'state');
    expect(states.map(s => [s.seq, s.value, s.by])).toEqual([[1, true, ca.id], [2, false, cb.id]]);
    expect(room.entry('lamp.on')).toMatchObject({ value: false, seq: 2, by: cb.id });
    const c = conn();
    room.join(c, JOIN('Cy'));
    expect(c.last().state).toEqual({ 'lamp.on': { value: false, seq: 2, by: cb.id } });
    expect(c.last().seq).toBe(2);
  });

  it('compare-and-set with `base` rejects a stale write and reports the current value', () => {
    const a = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.message(ca, msg({ t: 'op', key: 'k', value: 1 }));
    room.message(ca, msg({ t: 'op', key: 'k', value: 2, base: 0 }));
    expect(a.last()).toMatchObject({ t: 'reject', key: 'k', reason: 'stale', seq: 1, value: 1 });
    room.message(ca, msg({ t: 'op', key: 'k', value: 2, base: 1 }));
    expect(a.last()).toMatchObject({ t: 'state', value: 2, seq: 2 });
  });

  it('limits ops per second and the size of a value', () => {
    const a = conn();
    const ca = room.join(a, JOIN('Ada'));
    for (let i = 0; i < 12; i++) room.message(ca, msg({ t: 'op', key: 'k', value: i }));
    const rejects = a.json().filter(m => m.t === 'reject');
    expect(rejects.length).toBe(2);
    expect(rejects[0].reason).toBe('limit');
    ck.advance(1000);
    a.clear();
    room.message(ca, msg({ t: 'op', key: 'k', value: 'x'.repeat(5000) }));
    expect(a.last()).toMatchObject({ t: 'reject', reason: 'size' });
    room.message(ca, msg({ t: 'op', key: 'k', value: 'ok' }));
    expect(a.last()).toMatchObject({ t: 'state', value: 'ok' });
  });

  it('snapshot and restore carry the state and the sequence', () => {
    const a = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.message(ca, msg({ t: 'op', key: 'k', value: { deep: [1] } }));
    const snap = JSON.parse(JSON.stringify(room.snapshot()));
    expect(room.takeDirty()).toBe(true);
    expect(room.takeDirty()).toBe(false);
    const other = createRoom({ scene: 'loft', now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer });
    expect(other.restore(snap)).toBe(true);
    expect(other.entry('k')).toMatchObject({ value: { deep: [1] }, seq: 1 });
    expect(other.seq).toBe(1);
    expect(other.restore({ scene: 'nope', state: {} })).toBe(false);
  });
});

describe('leases', () => {
  it('only the holder may write; the lease is refreshed by ops, dropped by hand, and expires', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada')), cb = room.join(b, JOIN('Bob'));
    room.message(ca, msg({ t: 'grab', key: 'box' }));
    expect(b.last()).toMatchObject({ t: 'lease', key: 'box', owner: ca.id, until: ck.now() + 5000 });
    room.message(cb, msg({ t: 'op', key: 'box', value: 1 }));
    expect(b.last()).toMatchObject({ t: 'reject', reason: 'leased' });
    room.message(cb, msg({ t: 'grab', key: 'box' }));
    expect(b.last()).toMatchObject({ t: 'reject', reason: 'leased' });
    ck.advance(4000);
    room.message(ca, msg({ t: 'op', key: 'box', value: 2 })); // refreshes
    ck.advance(4000);
    expect(room.entry('box').owner).toBe(ca.id);
    room.message(ca, msg({ t: 'drop', key: 'box' }));
    expect(b.last()).toMatchObject({ t: 'lease', key: 'box', owner: null });
    room.message(cb, msg({ t: 'op', key: 'box', value: 3 }));
    expect(b.last()).toMatchObject({ t: 'state', value: 3 });
    // expiry without a refresh
    room.message(cb, msg({ t: 'grab', key: 'box' }));
    ck.advance(5100);
    expect(room.entry('box').owner).toBe(null);
    expect(a.last()).toMatchObject({ t: 'lease', key: 'box', owner: null });
  });

  it('a leaving client lets go of its leases', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.join(b, JOIN('Bob'));
    room.message(ca, msg({ t: 'grab', key: 'box' }));
    room.leave(ca);
    expect(b.json().filter(m => m.t === 'lease').at(-1)).toMatchObject({ owner: null });
    expect(b.json().some(m => m.t === 'leave' && m.id === ca.id)).toBe(true);
  });
});

describe('liveness and resume', () => {
  it('drops a silent client and forgets it after the resume window', () => {
    const a = conn(), b = conn();
    const ca = room.join(a, JOIN('Ada')), cb = room.join(b, JOIN('Bob'));
    ck.advance(5000);
    room.message(cb, msg({ t: 'ping', c: 1 }));
    expect(b.last()).toEqual({ t: 'pong', c: 1, s: ck.now() });
    ck.advance(7000);
    expect(a.closed?.code).toBe(4001);
    expect(room.size).toBe(1);
    expect(b.json().some(m => m.t === 'leave' && m.id === ca.id)).toBe(true);
    // a resume within the window gets the same id
    const a2 = conn();
    const back = room.join(a2, JOIN('Ada', { resume: { id: ca.id, token: ca.token } }));
    expect(back.id).toBe(ca.id);
    room.leave(back);
    ck.advance(33000);
    const a3 = conn();
    const fresh = room.join(a3, JOIN('Ada', { resume: { id: ca.id, token: ca.token } }));
    expect(fresh.id).not.toBe(ca.id);
  });

  it('a resume with a wrong token is a new join', () => {
    const a = conn();
    const ca = room.join(a, JOIN('Ada'));
    room.leave(ca);
    const n = room.join(conn(), JOIN('Ada', { resume: { id: ca.id, token: 'wrongwrongwrong' } }));
    expect(n.id).not.toBe(ca.id);
  });

  it('calls onEmpty when the last client leaves and close() shuts everything', () => {
    let empty = 0;
    const r = createRoom({ scene: 'loft', now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer, onEmpty: () => empty++ });
    const a = conn();
    const ca = r.join(a, JOIN());
    r.leave(ca);
    expect(empty).toBe(1);
    const b = conn();
    r.join(b, JOIN());
    r.close();
    expect(b.closed.code).toBe(1001);
    expect(r.size).toBe(0);
  });
});

describe('100 clients', () => {
  it('fans out every pose once per tick in one frame per client', () => {
    const conns = Array.from({ length: 100 }, () => conn());
    const cs = conns.map((c, i) => room.join(c, JOIN(`u${i}`)));
    conns.forEach(c => c.clear());
    cs.forEach((c, i) => room.message(c, packPose({ position: [i, 1, 0], yaw: 0, pitch: 0 })));
    ck.advance(100);
    for (const c of conns) {
      const f = c.frames();
      expect(f.length).toBe(1);
      expect(f[0].entries.length).toBe(100);
    }
    expect(room.stats.poses).toBe(100);
  });
});

describe('touch', () => {
  it('a transport pong keeps a silent client alive', () => {
    const a = conn();
    const ca = room.join(a, JOIN('Ada'));
    const r2 = createRoom({ scene: 'loft', now: ck.now, setTimer: ck.setTimer, clearTimer: ck.clearTimer, idleMs: 10000 });
    const b = conn();
    const cb = r2.join(b, JOIN('Bob'));
    ck.advance(8000);
    r2.touch(cb);
    ck.advance(8000);
    expect(r2.size).toBe(1);
    ck.advance(8000);
    expect(r2.size).toBe(0);
    expect(ca.lastSeen).toBeLessThan(ck.now()); // the other room never touched its client
  });
});
