import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** A WebSocket the test drives by hand. */
class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  ops() { return this.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d)).filter(m => m.t === 'op'); }
}

let sync, shared, stop, ws;
const welcome = (state = {}) => ({ t: 'welcome', v: 1, id: 1, token: 'abcdefgh', now: Date.now(), seq: 0, tickMs: 100, peers: [], state });

beforeEach(async () => {
  FakeWS.all = [];
  vi.stubGlobal('location', { search: '?event=t', origin: 'http://localhost' });
  vi.stubGlobal('window', { WebSocket: FakeWS, sessionStorage: { getItem: () => null, setItem: () => {} } });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  vi.resetModules();
  sync = await import('../src/net/sync.js');
  shared = await import('../src/net/shared.js');
  stop = sync.startSync({ name: 'loft', multiplayer: {} });
  ws = FakeWS.all[0];
  ws.open();
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); });

describe('shared state in an event', () => {
  it('shows our own write at once and keeps it until the server orders it', () => {
    ws.receive(welcome({ k: { value: 1, seq: 1, by: 2 } }));
    expect(shared.getShared('k', 0)).toBe(1);
    shared.setShared('k', 5);
    expect(shared.getShared('k', 0)).toBe(5);
    expect(ws.ops()).toEqual([{ t: 'op', key: 'k', value: 5 }]);
    ws.receive({ t: 'state', key: 'k', value: 5, seq: 2, by: 1 });
    expect(shared.getShared('k', 0)).toBe(5);
  });

  it('drops our guess when the server rejects the write, and shows the server\'s value again', () => {
    ws.receive(welcome({ k: { value: 1, seq: 1, by: 2 } }));
    shared.setShared('k', 5);
    expect(shared.getShared('k', 0)).toBe(5);
    ws.receive({ t: 'reject', key: 'k', reason: 'limit' });
    expect(shared.getShared('k', 0)).toBe(1);
  });

  it('falls back to the initial value when a rejected write was the first one for the key', () => {
    ws.receive(welcome());
    shared.setShared('fresh', true);
    ws.receive({ t: 'reject', key: 'fresh', reason: 'leased', seq: 3, value: false });
    expect(shared.getShared('fresh', 'initial')).toBe('initial');
  });

  it('keeps a newer write of ours when an earlier reject is for another key', () => {
    ws.receive(welcome());
    shared.setShared('a', 1);
    shared.setShared('b', 2);
    ws.receive({ t: 'reject', key: 'a', reason: 'limit' });
    expect(shared.getShared('a', 0)).toBe(0);
    expect(shared.getShared('b', 0)).toBe(2);
  });

  it('two rejects in a row both clear their key', () => {
    ws.receive(welcome());
    shared.setShared('a', 1);
    ws.receive({ t: 'reject', key: 'a', reason: 'limit' });
    shared.setShared('a', 2);
    ws.receive({ t: 'reject', key: 'a', reason: 'limit' });
    expect(shared.getShared('a', 0)).toBe(0);
  });
});
