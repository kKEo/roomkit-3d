/**
 * The live-data hub: one shared, refcounted connection per data source, however many screens and
 * blocks show it, and through however many transforms. No React and no browser globals here
 * (everything is injected), so it runs under test.
 *
 * A feed spec is `{ url?, stream?, refresh?, transform?, transformUrl? }` with absolute URLs:
 * - `url` is fetched when the first subscriber arrives, then every `refresh` seconds while anyone
 *   is subscribed (chained timeouts, so requests never overlap; skipped while the page is hidden
 *   and caught up when it shows again).
 * - `stream` is a Server-Sent Events URL; each message is a JSON value.
 * - `transform(json, { previous, url, event })` turns a response into the value subscribers see;
 *   returning `undefined` keeps the previous value. `event` is "fetch" or "message".
 *
 * Two layers: a *source* (url + stream + refresh) does the network work once; a *view* (source +
 * transform) holds what its subscribers see. So four screens reading one file through four
 * transforms make one request per interval.
 *
 * Each response or message replaces the value. A failure keeps the last good value and marks the
 * snapshot `error` (a "stale" value); polling backs off up to 5 minutes. Each distinct failure is
 * warned once per source.
 */

/** What a feed shows before anything has been asked for. */
export const IDLE = Object.freeze({ status: 'idle', value: undefined, error: null, at: 0 });

/** Feeds with the same source share one connection. */
export const sourceKey = s => [s.url ?? '', s.stream ?? '', s.refresh ?? 0].join('\n');
/** Feeds with the same key (source and transform) share one value. */
export const feedKey = s => `${sourceKey(s)}\n${s.transformUrl ?? ''}`;

const CLOSED = 2; // EventSource.CLOSED

/** Seconds to wait before retry number `fails` (1, 2, …): doubling from the refresh interval (at least 5 s), at most 5 minutes. */
export const backoff = (refresh, fails) => Math.min(300, Math.max(refresh ?? 5, 5) * 2 ** (fails - 1));

export function createHub({
  fetchJson, EventSource, guard = url => url, visibility = null,
  now = Date.now, warn = console.warn, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const sources = new Map();
  const views = new Map();
  const warned = new Set();
  let watching = false;

  // ---- views: what subscribers see --------------------------------------------------------

  function viewFor(spec) {
    const key = feedKey(spec);
    let v = views.get(key);
    if (!v) {
      v = { key, spec, subs: new Set(), snap: IDLE, seq: 0, src: null };
      views.set(key, v);
    } else if (spec.transform !== v.spec.transform) v.spec = spec; // a reloaded transform module (editor)
    return v;
  }

  function emit(v, snap) {
    v.snap = snap;
    for (const cb of [...v.subs]) cb();
  }

  /** Runs the view's transform over its source's latest data and publishes the result. */
  async function apply(v) {
    const { raw, event } = v.src;
    const seq = ++v.seq;
    const { transform } = v.spec;
    try {
      const value = transform
        ? await transform(raw, { previous: v.snap.value, url: event === 'fetch' ? v.spec.url : v.spec.stream, event })
        : raw;
      if (seq !== v.seq) return;
      emit(v, { status: 'ok', value: value === undefined ? v.snap.value : value, error: null, at: now() });
    } catch (err) {
      if (seq !== v.seq) return;
      viewError(v, err);
    }
  }

  function viewError(v, err) {
    const msg = err?.message ?? String(err);
    const tag = `${v.key}\n${msg}`;
    if (!warned.has(tag)) { warned.add(tag); warn(`Feed ${v.spec.url ?? v.spec.stream}: ${msg}`); }
    emit(v, { status: 'error', value: v.snap.value, error: msg, at: now() });
  }

  // ---- sources: the network --------------------------------------------------------------

  function sourceFor(spec) {
    const key = sourceKey(spec);
    let s = sources.get(key);
    if (!s) {
      s = {
        key, url: spec.url, stream: spec.stream, refresh: spec.refresh, views: new Set(),
        raw: undefined, event: null, has: false,
        timer: null, ctrl: null, seq: 0, fails: 0, due: false, es: null, esTimer: null, esFails: 0,
      };
      sources.set(key, s);
    }
    return s;
  }

  function data(s, json, event) {
    s.raw = json; s.event = event; s.has = true;
    for (const v of s.views) apply(v);
  }

  function sourceError(s, err) {
    const msg = err?.message ?? String(err);
    const tag = `${s.key}\n${msg}`;
    if (!warned.has(tag)) { warned.add(tag); warn(`Feed ${s.url ?? s.stream}: ${msg}`); }
    for (const v of s.views) { v.seq++; emit(v, { status: 'error', value: v.snap.value, error: msg, at: now() }); }
  }

  function schedule(s) {
    if (!s.views.size || !s.url) return;
    const seconds = s.fails ? backoff(s.refresh, s.fails) : s.refresh;
    if (seconds) s.timer = setTimer(() => { s.timer = null; poll(s); }, seconds * 1000);
  }

  async function poll(s) {
    if (!s.views.size || !s.url) return;
    if (visibility?.hidden()) { s.due = true; return; }
    s.due = false;
    const seq = ++s.seq;
    s.ctrl?.abort();
    const ctrl = s.ctrl = new AbortController();
    const current = () => seq === s.seq && s.views.size > 0;
    try {
      const json = await fetchJson(guard(s.url), ctrl.signal);
      if (!current()) return;
      s.fails = 0;
      data(s, json, 'fetch');
    } catch (err) {
      if (!current()) return;
      s.fails++;
      sourceError(s, err);
    }
    schedule(s);
  }

  function openStream(s) {
    if (!s.stream || s.es) return;
    if (!EventSource) { sourceError(s, new Error('this browser cannot open event streams')); return; }
    let es;
    try { es = new EventSource(guard(s.stream)); } catch (err) { sourceError(s, err); return; }
    s.es = es;
    es.onopen = () => { s.esFails = 0; };
    es.onmessage = msg => {
      if (s.es !== es) return;
      let json;
      try { json = JSON.parse(msg.data); } catch { sourceError(s, new Error('a stream message is not JSON')); return; }
      data(s, json, 'message');
    };
    es.onerror = () => {
      if (s.es !== es) return;
      if (es.readyState !== CLOSED) { sourceError(s, new Error('stream interrupted, reconnecting')); return; } // the browser retries by itself
      es.close();
      s.es = null;
      s.esFails++;
      sourceError(s, new Error('stream closed'));
      s.esTimer = setTimer(() => { s.esTimer = null; if (s.views.size) openStream(s); }, backoff(5, s.esFails) * 1000);
    };
  }

  function start(s) {
    watch();
    s.fails = 0;
    s.esFails = 0;
    if (s.url) poll(s);
    openStream(s);
  }

  function stop(s) {
    s.seq++;
    s.ctrl?.abort();
    s.ctrl = null;
    if (s.timer) clearTimer(s.timer);
    if (s.esTimer) clearTimer(s.esTimer);
    s.timer = s.esTimer = null;
    s.es?.close();
    s.es = null;
    s.due = false;
  }

  /** Catch up on polls skipped while the page was hidden (attached on first use, not at import). */
  function watch() {
    if (watching || !visibility) return;
    watching = true;
    visibility.onChange(() => {
      if (visibility.hidden()) return;
      for (const s of sources.values()) if (s.due && s.views.size && !s.timer) poll(s);
    });
  }

  function attach(v) {
    const s = v.src = sourceFor(v.spec);
    s.views.add(v);
    if (v.snap.status === 'idle') emit(v, { ...IDLE, status: 'loading' });
    if (s.views.size === 1) start(s);
    else if (s.has) apply(v); // the source already has data: show it at once
  }

  function detach(v) {
    const s = v.src;
    v.seq++;
    s.views.delete(v);
    if (!s.views.size) stop(s);
  }

  return {
    /** Calls `cb` (no arguments) whenever the feed's snapshot changes; returns the unsubscribe function. */
    subscribe(spec, cb) {
      const v = viewFor(spec);
      v.subs.add(cb);
      if (v.subs.size === 1) attach(v);
      return () => {
        if (!v.subs.delete(cb) || v.subs.size) return;
        detach(v);
      };
    },
    /** The current `{ status, value, error, at }` of a feed; the same object until it changes. */
    get: spec => views.get(feedKey(spec))?.snap ?? IDLE,
    /** Forget the cached values of feeds nobody shows any more (a different scene was loaded). */
    prune() {
      for (const [key, v] of views) if (!v.subs.size) views.delete(key);
      for (const [key, s] of sources) if (!s.views.size) sources.delete(key);
    },
  };
}
