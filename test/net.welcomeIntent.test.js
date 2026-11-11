import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeWS } from './fakeWebSocket.js';

const here = { position: [1, 1.7, 2], target: [1, 1.7, 1] };
const flight = { kind: 'poi', from: { position: [0, 1.7, 0], target: [0, 1.7, -1] }, to: { position: [8, 1.7, 0], target: [8, 1.7, -1] }, poi: 'desk', duration: 2000, ease: 'quint', arc: true };
const welcome = { t: 'welcome', v: 1, id: 1, token: 'abcdefgh', now: Date.now(), seq: 0, tickMs: 100, peers: [], state: {} };

let sync, store, stop, ws;
beforeEach(async () => {
  FakeWS.all = [];
  vi.stubGlobal('location', { search: '?event=t', origin: 'http://localhost' });
  vi.stubGlobal('window', { WebSocket: FakeWS, sessionStorage: { getItem: () => null, setItem: () => {} } });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  vi.resetModules();
  sync = await import('../src/net/sync.js');
  store = await import('../src/state/store.js');
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); });

describe('welcomeIntent', () => {
  it('reports a parked visitor as parked where the camera is, not as a flight to replay', () => {
    expect(sync.welcomeIntent(flight, 0, here, false, 60000)).toEqual({ kind: 'still', from: here });
    expect(sync.welcomeIntent(null, 0, here, false, 0)).toEqual({ kind: 'still', from: here });
  });

  it('reports a visitor who flies by hand as flying from here', () => {
    expect(sync.welcomeIntent({ kind: 'free', from: flight.from }, 0, here, false, 5000)).toEqual({ kind: 'free', from: here });
  });

  it('gives a flight still in progress the rest of its time, from here to where it was going', () => {
    const i = sync.welcomeIntent(flight, 1000, here, true, 2200); // 1.2 s into a 2 s flight
    expect(i).toMatchObject({ kind: 'poi', from: here, to: flight.to, poi: 'desk', arc: true, ease: 'linear' });
    expect(i.duration).toBeCloseTo(800, 5);
    expect(i.reverse).toBeUndefined();
  });

  it('does not replay a flight whose time is up, even if the camera still says it is flying', () => {
    expect(sync.welcomeIntent(flight, 0, here, true, 1950)).toEqual({ kind: 'still', from: here });
    expect(sync.welcomeIntent(flight, 0, here, true, 9000)).toEqual({ kind: 'still', from: here });
  });
});

describe('after a reconnect', () => {
  const intents = sock => sock.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d)).filter(m => m.t === 'intent').map(m => m.intent);

  it('does not send the old flight again', () => {
    stop = sync.startSync({ name: 'loft', multiplayer: {} });
    ws = FakeWS.all[0]; ws.open(); ws.receive(welcome);
    sync.presence.flight(flight); // flew to the desk, then parked there
    store.runtime.pose.position = [8, 1.7, 0]; store.runtime.pose.target = [8, 1.7, -1];
    store.runtime.transiting = false;
    ws.close(); // the network drops
    sync.syncClient().retryNow(); // and the page reconnects at once (as when its tab becomes visible again)
    const again = FakeWS.all.at(-1);
    expect(again).not.toBe(ws);
    again.open(); again.receive(welcome);
    expect(intents(again)).toEqual([{ kind: 'still', from: { position: [8, 1.7, 0], target: [8, 1.7, -1] } }]);
  });
});
