import { useEffect, useMemo } from 'react';
import { liveScreenSchema } from '../prefabs/screenSchema.js';
import { isRelative } from '../config/buildScene.js';
import { guardData } from '../config/origins.js';
import { useStore } from '../state/store.js';
import { useFeed } from './useFeed.js';

// feed snapshot → liveScreenSchema result, so a value is validated once per snapshot (the hub makes a new
// snapshot for every answer; keying on the value itself would miss a transform that mutates and returns the same object)
const checked = new WeakMap();

/**
 * A screen's config with its feed's latest value merged over it, and the status to show:
 * "static" (no feed), "loading", "ok" or "error" (an error with a value is stale data).
 * A value that is not valid screen fields is an error and the static config is shown;
 * a relative `src` in a value resolves against the feed's URL and must pass `guard`;
 * a `form` in a value cannot change the `action` the scene gave the form.
 */
export function mergeLive(config, snap, feedUrl, guard = guardData) {
  if (!config.feed) return { config, status: 'static', error: null };
  const { status, value, error } = snap;
  if (value === undefined) return { config, status, error };
  let r = checked.get(snap);
  if (!r) {
    r = liveScreenSchema.safeParse(value);
    checked.set(snap, r);
  }
  if (!r.success) {
    const why = r.error.issues.map(i => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
    return { config, status: 'error', error: `the feed's value is not screen fields — ${why}` };
  }
  let live = r.data;
  // a feed's form is merged over the author's, which alone decides where the form submits
  if (live.form) live = { ...live, form: { ...config.form, ...live.form, ...(config.form?.action != null ? { action: config.form.action } : {}) } };
  if (typeof live.src === 'string') {
    try {
      const src = feedUrl && isRelative(live.src) ? new URL(live.src, feedUrl).href : live.src;
      live = { ...live, src: guard(src) };
    } catch (e) {
      const { src: _dropped, ...rest } = live;
      return { config: { ...config, ...rest }, status: 'error', error: e.message };
    }
  }
  return { config: { ...config, ...live }, status, error };
}

const warned = new Set();

/** `mergeLive` for a screen config, live; also warns (once per message) when a feed sends the wrong shape. */
export function useLiveScreen(config) {
  const snap = useFeed(config.feed);
  const resolveUrl = useStore(s => s.scene?.resolveUrl);
  const base = config.feed?.url ?? config.feed?.stream;
  const feedUrl = base && resolveUrl && isRelative(base) ? resolveUrl(base) : base;
  const key = JSON.stringify(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `config` is a fresh object each render; `key` is its content
  const merged = useMemo(() => mergeLive(config, snap, feedUrl), [key, snap, feedUrl]);
  const shapeError = merged.status === 'error' && merged.error !== snap.error ? merged.error : null;
  useEffect(() => {
    if (!shapeError || warned.has(shapeError)) return;
    warned.add(shapeError);
    console.warn(`Feed ${feedUrl}: ${shapeError}`);
  }, [shapeError, feedUrl]);
  return merged;
}
