import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../state/store.js';
import { isRelative } from '../config/buildScene.js';
import { feeds } from './feeds.js';
import { IDLE } from './hub.js';

/**
 * The hub spec for a validated feed config: URLs resolved against the scene folder, the transform
 * looked up in the scene's `transforms`. An unknown transform (possible in a fenced block, which is
 * only parsed when it renders) gives `{ error }` instead.
 */
export function feedSpec(feed, { resolveUrl = u => u, transforms = {} } = {}) {
  const abs = u => (u && isRelative(u) ? resolveUrl(u) : u);
  const spec = { url: abs(feed.url), stream: abs(feed.stream), refresh: feed.refresh };
  if (!feed.transform) return spec;
  const t = Object.hasOwn(transforms, feed.transform) ? transforms[feed.transform] : null; // not `constructor` & co.
  if (!t) return { error: Object.freeze({ ...IDLE, status: 'error', error: `unknown transform "${feed.transform}"` }) };
  return { ...spec, transform: t.fn, transformUrl: t.url };
}

/** The live `{ status, value, error, at }` of a feed config (or IDLE without one); re-renders when it changes. */
export function useFeed(feed) {
  const resolveUrl = useStore(s => s.scene?.resolveUrl);
  const transforms = useStore(s => s.scene?.transforms);
  const key = feed ? JSON.stringify(feed) : '';
  const spec = useMemo(() => (key ? feedSpec(JSON.parse(key), { resolveUrl, transforms }) : null), [key, resolveUrl, transforms]);
  const subscribe = useCallback(cb => (spec && !spec.error ? feeds.subscribe(spec, cb) : () => {}), [spec]);
  const get = useCallback(() => (!spec ? IDLE : spec.error ?? feeds.get(spec)), [spec]);
  return useSyncExternalStore(subscribe, get, get);
}
