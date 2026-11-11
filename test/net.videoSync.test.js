import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeWS } from './fakeWebSocket.js';

/** A <video> that throws where a browser does: a non-finite currentTime and an unsupported playbackRate. */
function fakeVideo() {
  let time = 0, rate = 1;
  return {
    paused: true, duration: 120, loop: true,
    get currentTime() { return time; },
    set currentTime(v) { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('currentTime is not finite'); time = v; },
    get playbackRate() { return rate; },
    set playbackRate(v) { if (typeof v !== 'number' || !(v >= 0.0625 && v <= 16)) throw new DOMException('rate not supported', 'NotSupportedError'); rate = v; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

let sync, videoSync, stop, ws, off;
const welcome = (state = {}) => ({ t: 'welcome', v: 1, id: 1, token: 'abcdefgh', now: Date.now(), seq: 0, tickMs: 100, peers: [], state });
const entry = (value, seq = 1) => ({ value, seq, by: 2 });

beforeEach(async () => {
  FakeWS.all = [];
  vi.stubGlobal('location', { search: '?event=t', origin: 'http://localhost' });
  vi.stubGlobal('window', { WebSocket: FakeWS, sessionStorage: { getItem: () => null, setItem: () => {} } });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  vi.resetModules();
  sync = await import('../src/net/sync.js');
  videoSync = await import('../src/net/videoSync.js');
  stop = sync.startSync({ name: 'loft', multiplayer: {} });
  ws = FakeWS.all[0];
  ws.open();
});
afterEach(() => { off?.(); off = null; stop?.(); vi.unstubAllGlobals(); });

describe('validVideoState', () => {
  it('accepts what publishVideo writes, and a state without a rate', () => {
    expect(videoSync.validVideoState({ playing: true, at: 12.5, t0: 1700000000000, rate: 1 })).toBe(true);
    expect(videoSync.validVideoState({ playing: false, at: 0, t0: 5 })).toBe(true);
    expect(videoSync.validVideoState({ playing: true, at: 3, t0: 5, rate: 0.25 })).toBe(true);
    expect(videoSync.validVideoState({ playing: true, at: 3, t0: 5, rate: 2 })).toBe(true);
  });

  it('refuses anything else', () => {
    const base = { playing: true, at: 1, t0: 1, rate: 1 };
    for (const bad of [null, undefined, 5, 'x', [], { ...base, playing: 'yes' }, { ...base, at: 'x' }, { ...base, at: NaN }, { ...base, at: -1 },
      { ...base, at: Infinity }, { ...base, t0: null }, { ...base, rate: 1000 }, { ...base, rate: 0 }, { ...base, rate: -1 }, { ...base, rate: '1' }, { ...base, rate: NaN }]) {
      expect(videoSync.validVideoState(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('followVideo with hostile shared state', () => {
  it('ignores a bad state at the start and leaves the video alone', () => {
    ws.receive(welcome({ 's.video': entry({ playing: true, at: 'x', t0: 0 }) }));
    const video = fakeVideo();
    expect(() => { off = videoSync.followVideo('s', video); }).not.toThrow();
    expect(video.currentTime).toBe(0);
    expect(video.paused).toBe(true);
  });

  it('survives a bad state that arrives later, for every kind of bad value', () => {
    ws.receive(welcome());
    const video = fakeVideo();
    off = videoSync.followVideo('s', video);
    let seq = 1;
    for (const bad of [{ playing: true, at: 'x', t0: 0 }, { playing: true, at: 0, t0: 0, rate: 1000 }, { playing: true, at: NaN, t0: 0 }, 'nope', null, { playing: 1 }]) {
      expect(() => ws.receive({ t: 'state', key: 's.video', value: bad, seq: ++seq, by: 2 }), JSON.stringify(bad)).not.toThrow();
    }
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(1);
  });

  it('still follows a good state, before and after the bad ones', () => {
    ws.receive(welcome());
    const video = fakeVideo();
    off = videoSync.followVideo('s', video);
    ws.receive({ t: 'state', key: 's.video', value: { playing: true, at: 'x', t0: 0 }, seq: 1, by: 2 });
    ws.receive({ t: 'state', key: 's.video', value: { playing: false, at: 30, t0: Date.now(), rate: 2 }, seq: 2, by: 2 });
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(2);
    expect(video.paused).toBe(true);
    ws.receive({ t: 'state', key: 's.video', value: { playing: true, at: 31, t0: Date.now(), rate: 1 }, seq: 3, by: 2 });
    expect(video.paused).toBe(false);
  });
});
