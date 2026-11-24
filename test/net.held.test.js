import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeWS } from './fakeWebSocket.js';

let sync, held, stop, ws;
const peer = (id, name) => ({ id, name, color: '#00ff66', intent: null });
const welcome = (peers = []) => ({ t: 'welcome', v: 1, id: 1, token: 'abcdefgh', now: Date.now(), seq: 0, tickMs: 100, peers, state: {} });
const holds = () => ws.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d)).filter(m => m.t === 'hold').map(m => m.keys);
const tick = () => new Promise(r => queueMicrotask(r));

beforeEach(async () => {
  FakeWS.all = [];
  vi.stubGlobal('location', { search: '?event=t', origin: 'http://localhost' });
  vi.stubGlobal('window', { WebSocket: FakeWS, sessionStorage: { getItem: () => null, setItem: () => {} } });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  vi.resetModules();
  sync = await import('../src/net/sync.js');
  held = await import('../src/net/held.js');
});
afterEach(() => { stop?.(); stop = null; vi.unstubAllGlobals(); });

function start() {
  stop = sync.startSync({ name: 'loft', multiplayer: {} });
  ws = FakeWS.all.at(-1);
  ws.open();
}

describe('what visitors hold open', () => {
  it('outside an event only this page counts', () => {
    expect(held.isHeld('poi:a')).toBe(false);
    const release = held.hold('poi:a');
    expect(held.isHeld('poi:a')).toBe(true);
    release();
    expect(held.isHeld('poi:a')).toBe(false);
  });

  it('a key is held while a peer holds it, until it lets go or leaves', () => {
    start();
    ws.receive(welcome([peer(2, 'Bob')]));
    let calls = 0;
    const off = sync.useSync.subscribe(() => { calls++; });
    ws.receive({ t: 'hold', id: 2, keys: ['poi:archive'] });
    expect(calls).toBeGreaterThan(0); // React is told
    expect(held.isHeld('poi:archive')).toBe(true);
    expect(held.isHeld('poi:desk')).toBe(false);
    ws.receive({ t: 'hold', id: 2, keys: [] });
    expect(held.isHeld('poi:archive')).toBe(false);
    ws.receive({ t: 'hold', id: 2, keys: ['poi:archive'] });
    ws.receive({ t: 'leave', id: 2 });
    expect(held.isHeld('poi:archive')).toBe(false);
    off();
  });

  it('sends the whole list once per change, and one message for a stop let go and the next taken', async () => {
    start();
    ws.receive(welcome());
    const a = held.hold('poi:a');
    await tick();
    expect(holds()).toEqual([['poi:a']]);
    a(); a(); // letting go twice counts once
    const b = held.hold('poi:b');
    await tick();
    expect(holds()).toEqual([['poi:a'], ['poi:b']]);
    held.hold('poi:b')(); // taken and let go again by a second holder: nothing new to say
    await tick();
    expect(holds()).toHaveLength(2);
    b();
    await tick();
    expect(holds().at(-1)).toEqual([]);
  });

  it('says what it holds again after a reconnect, and what it held before it joined', async () => {
    held.hold('poi:a');
    await tick();
    start();
    ws.receive(welcome());
    expect(holds()).toEqual([['poi:a']]);
    ws.close();
    ws = await vi.waitFor(() => { const w = FakeWS.all.at(-1); if (w === ws) throw new Error('no reconnect yet'); return w; }, { timeout: 3000 });
    ws.open();
    ws.receive(welcome());
    expect(holds()).toEqual([['poi:a']]);
  });
});
