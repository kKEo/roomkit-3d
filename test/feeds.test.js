import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHub, feedKey, sourceKey, backoff, IDLE } from '../src/data/hub.js';
import { feedSpec } from '../src/data/useFeed.js';

/** A fake EventSource the test drives by hand. */
class FakeES {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.closed = false; FakeES.all.push(this); }
  close() { this.closed = true; this.readyState = 2; }
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
  drop(closed) { this.readyState = closed ? 2 : 0; this.onerror?.(); }
}

const flush = () => vi.advanceTimersByTimeAsync(0);

let fetchJson, warn, visible, onShow, hub;
beforeEach(() => {
  vi.useFakeTimers();
  FakeES.all = [];
  fetchJson = vi.fn(async url => ({ url, n: fetchJson.mock.calls.length }));
  warn = vi.fn();
  visible = true;
  onShow = null;
  hub = createHub({
    fetchJson, EventSource: FakeES, warn, now: () => 1000,
    guard: url => { if (url.startsWith('https://evil')) throw new Error('blocked'); return url; },
    visibility: { hidden: () => !visible, onChange: cb => { onShow = cb; } },
  });
});
afterEach(() => vi.useRealTimers());

describe('feed hub', () => {
  it('shares one entry between subscribers and fetches once', async () => {
    const spec = { url: 'https://a/x.json' };
    const a = vi.fn(), b = vi.fn();
    hub.subscribe(spec, a);
    hub.subscribe({ ...spec }, b);
    expect(hub.get(spec).status).toBe('loading');
    await flush();
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(hub.get(spec)).toMatchObject({ status: 'ok', value: { url: 'https://a/x.json', n: 1 }, error: null });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('feeds of one source through different transforms make one request, and a late subscriber gets data at once', async () => {
    const a = { url: 'https://a/x.json', refresh: 10, transform: j => j.n, transformUrl: 't#n' };
    const b = { url: 'https://a/x.json', refresh: 10, transform: j => j.url, transformUrl: 't#url' };
    hub.subscribe(a, () => {});
    hub.subscribe(b, () => {});
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(hub.get(a).value).toBe(2);
    expect(hub.get(b).value).toBe('https://a/x.json');
    const c = { url: 'https://a/x.json', refresh: 10, transform: j => `#${j.n}`, transformUrl: 't#c' };
    hub.subscribe(c, () => {});
    await flush();
    expect(hub.get(c).value).toBe('#2');
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('polls every refresh seconds without overlapping, and stops after the last unsubscribe', async () => {
    const spec = { url: 'https://a/x.json', refresh: 10 };
    const off = hub.subscribe(spec, () => {});
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchJson).toHaveBeenCalledTimes(3);
    off();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchJson).toHaveBeenCalledTimes(3);
    expect(hub.get(spec).value.n).toBe(3); // kept for a remount
  });

  it('aborts the request in flight and ignores its answer when the last subscriber leaves', async () => {
    let signal, resolve;
    fetchJson.mockImplementationOnce((url, s) => { signal = s; return new Promise(r => { resolve = r; }); });
    const spec = { url: 'https://a/slow.json' };
    const off = hub.subscribe(spec, () => {});
    off();
    expect(signal.aborted).toBe(true);
    resolve({ late: true });
    await flush();
    expect(hub.get(spec).value).toBeUndefined();
  });

  it('keeps the last good value on error, backs off, warns once per message and recovers', async () => {
    const spec = { url: 'https://a/x.json', refresh: 10 };
    hub.subscribe(spec, () => {});
    await flush();
    fetchJson.mockRejectedValue(new Error('HTTP 503'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hub.get(spec)).toMatchObject({ status: 'error', error: 'HTTP 503', value: { n: 1 } });
    await vi.advanceTimersByTimeAsync(10_000); // first retry after backoff(10, 1) = 10 s
    expect(fetchJson).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(19_000); // second retry waits 20 s
    expect(fetchJson).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchJson).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(1);
    fetchJson.mockImplementation(async () => ({ back: true }));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(hub.get(spec)).toMatchObject({ status: 'ok', value: { back: true } });
  });

  it('backoff doubles from the refresh interval (at least 5 s) up to 5 minutes', () => {
    expect([1, 2, 3].map(f => backoff(undefined, f))).toEqual([5, 10, 20]);
    expect(backoff(60, 4)).toBe(300);
  });

  it('runs the transform with the previous value; undefined keeps it, a throw is an error', async () => {
    const transform = vi.fn((json, { previous }) => (json.n === 2 ? undefined : json.n === 3 ? (() => { throw new Error('bad shape'); })() : [...(previous ?? []), json.n]));
    const spec = { url: 'https://a/x.json', refresh: 1, transform, transformUrl: 't.js#series' };
    hub.subscribe(spec, () => {});
    await flush();
    expect(hub.get(spec).value).toEqual([1]);
    expect(transform.mock.calls[0][1]).toMatchObject({ previous: undefined, url: 'https://a/x.json', event: 'fetch' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hub.get(spec)).toMatchObject({ status: 'ok', value: [1] });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hub.get(spec)).toMatchObject({ status: 'error', error: 'bad shape', value: [1] });
  });

  it('skips polls while the page is hidden and catches up once when it shows', async () => {
    const spec = { url: 'https://a/x.json', refresh: 5 };
    hub.subscribe(spec, () => {});
    await flush();
    visible = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    visible = true;
    onShow();
    await flush();
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('streams JSON messages, reports bad ones, and reopens a closed stream with backoff', async () => {
    const spec = { stream: 'https://a/sse' };
    hub.subscribe(spec, () => {});
    const es = FakeES.all[0];
    expect(es.url).toBe('https://a/sse');
    es.open();
    es.send({ v: 1 });
    await flush();
    expect(hub.get(spec)).toMatchObject({ status: 'ok', value: { v: 1 } });
    es.send('not json');
    expect(hub.get(spec)).toMatchObject({ status: 'error', value: { v: 1 } });
    es.drop(false); // the browser reconnects by itself
    expect(FakeES.all).toHaveLength(1);
    es.drop(true);
    expect(es.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeES.all).toHaveLength(2);
  });

  it('with url and stream, fetches first and then takes messages', async () => {
    const spec = { url: 'https://a/x.json', stream: 'https://a/sse' };
    hub.subscribe(spec, () => {});
    await flush();
    expect(hub.get(spec).value).toMatchObject({ n: 1 });
    FakeES.all[0].send({ live: true });
    await flush();
    expect(hub.get(spec).value).toEqual({ live: true });
  });

  it('closes the stream with the last subscriber', () => {
    const off = hub.subscribe({ stream: 'https://a/sse' }, () => {});
    off();
    expect(FakeES.all[0].closed).toBe(true);
  });

  it('a URL the guard rejects is an error, not a request', async () => {
    const spec = { url: 'https://evil.example/x.json' };
    hub.subscribe(spec, () => {});
    await flush();
    expect(fetchJson).not.toHaveBeenCalled();
    expect(hub.get(spec)).toMatchObject({ status: 'error', error: 'blocked' });
  });

  it('prune forgets unsubscribed feeds only', async () => {
    const a = { url: 'https://a/1.json' }, b = { url: 'https://a/2.json' };
    hub.subscribe(a, () => {})();
    hub.subscribe(b, () => {});
    await flush();
    hub.prune();
    expect(hub.get(a)).toBe(IDLE);
    expect(hub.get(b).status).toBe('ok');
  });

  it('feedKey separates refresh, stream and transform', () => {
    const keys = [{ url: 'u' }, { url: 'u', refresh: 5 }, { url: 'u', stream: 's' }, { url: 'u', transformUrl: 't#a' }].map(feedKey);
    expect(new Set(keys).size).toBe(4);
    expect(sourceKey({ url: 'u', transformUrl: 't#a' })).toBe(sourceKey({ url: 'u', transformUrl: 't#b' }));
  });
});

describe('feedSpec', () => {
  const ctx = { resolveUrl: p => `https://site/scenes/x/${p}`, transforms: { nodes: { url: 'https://site/t.js#nodes', fn: () => 1 } } };

  it('resolves relative URLs against the scene and leaves absolute ones', () => {
    expect(feedSpec({ url: 'data/a.json', stream: 'https://api/sse', refresh: 5 }, ctx))
      .toEqual({ url: 'https://site/scenes/x/data/a.json', stream: 'https://api/sse', refresh: 5 });
  });

  it('looks up the transform, or reports an unknown one', () => {
    expect(feedSpec({ url: 'a', transform: 'nodes' }, ctx)).toMatchObject({ transform: ctx.transforms.nodes.fn, transformUrl: 'https://site/t.js#nodes' });
    expect(feedSpec({ url: 'a', transform: 'nope' }, ctx).error).toMatchObject({ status: 'error', error: 'unknown transform "nope"' });
  });
});

describe('guardData and fetchJson', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const page = () => vi.stubGlobal('location', { href: 'https://site.test/app/', origin: 'https://site.test' });

  it('allows any origin unless VITE_DATA_ORIGINS is set', async () => {
    page();
    const { guardData } = await import('../src/config/origins.js');
    expect(guardData('https://api.example.com/x.json')).toBe('https://api.example.com/x.json');
    vi.stubEnv('VITE_DATA_ORIGINS', 'https://api.example.com');
    expect(guardData('https://api.example.com/x.json')).toBe('https://api.example.com/x.json');
    expect(guardData('https://site.test/scenes/x/d.json')).toBe('https://site.test/scenes/x/d.json');
    expect(() => guardData('https://other.example/x.json')).toThrow('blocked: https://other.example is not an allowed data origin');
  });

  it('fetchJson sends no credentials and rejects HTML, errors and bad JSON', async () => {
    const { fetchJson } = await import('../src/data/feeds.js');
    const respond = (body, { status = 200, type = 'application/json' } = {}) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } })));
    respond('{"a":1}');
    expect(await fetchJson('https://a/x.json')).toEqual({ a: 1 });
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    respond('<html>', { type: 'text/html' });
    await expect(fetchJson('https://a/x.json')).rejects.toThrow('HTML page');
    respond('nope', { status: 404 });
    await expect(fetchJson('https://a/x.json')).rejects.toThrow('HTTP 404');
    respond('{bad');
    await expect(fetchJson('https://a/x.json')).rejects.toThrow('not JSON');
  });
});
