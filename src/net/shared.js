import { useSyncExternalStore, useCallback } from 'react';
import { syncClient, useSync } from './syncStore.js';

/**
 * The scene state everyone in an event sees alike: a flat map key → JSON value, held by the sync
 * server (server/room.js orders the writes). Prefabs read a key with `useShared`, and write it with
 * the setter they get back or through the `set` / `toggle` actions (src/actions/registry.js).
 *
 * Writes are optimistic: the new value shows at once and is sent to the server; when the server's
 * ordered version arrives (the client's own write or a later one by someone else), it replaces the
 * local guess, so everyone converges on the server's order. Outside an event the map is local to
 * the page, so a prefab behaves the same in a plain viewer.
 */
const local = new Map();        // key → value, outside an event
const pending = new Map();      // key → { value, seq } writes of ours not yet ordered by the server
const subs = new Set();

const notify = () => { for (const cb of [...subs]) cb(); };

// the server's state changed: our pending writes that it has now ordered are done
useSync.subscribe((s, prev) => {
  if (s.version === prev.version) return;
  const c = syncClient();
  if (c) for (const [key, p] of pending) { const e = c.shared.get(key); if (e && e.seq > p.seq) pending.delete(key); }
  notify();
});
// the server refused a write of ours: stop showing it
useSync.subscribe((s, prev) => { if (s.rejected && s.rejected !== prev.rejected) rejectShared(s.rejected.key); });
useSync.subscribe((s, prev) => { if (s.active !== prev.active || s.status !== prev.status) { pending.clear(); notify(); } });

/** The current value of `key`: a pending write of ours, else the server's (or the page's own, outside an event). */
export function getShared(key, initial) {
  if (pending.has(key)) return pending.get(key).value;
  const c = syncClient();
  if (c) { const e = c.shared.get(key); return e && e.value !== undefined ? e.value : initial; }
  return local.has(key) ? local.get(key) : initial;
}

/** Who holds `key` (an ownership lease), or null. */
export function sharedOwner(key) {
  const c = syncClient();
  const e = c?.shared.get(key);
  return e && e.owner != null && (e.until == null || e.until > c.serverNow()) ? e.owner : null;
}

/** Write `key` for everyone (optimistically here, then ordered by the server). */
export function setShared(key, value) {
  const c = syncClient();
  if (!c) { local.set(key, value); notify(); return true; }
  const e = c.shared.get(key);
  pending.set(key, { value, seq: e?.seq ?? 0 });
  notify();
  return c.op(key, value);
}

export const toggleShared = (key, initial = false) => setShared(key, !getShared(key, initial));

/** Hold `key` against other writers while dragging something (the server lets it go after a few idle seconds). */
export const grabShared = key => syncClient()?.grab(key) ?? true;
export const dropShared = key => syncClient()?.drop(key) ?? true;

/**
 * The server refused our write of `key` (rate limit, a lease held by someone else, a stale base, too big):
 * the guess we showed is wrong, so drop it and show what the server has. Without this the writer would keep
 * its own value while everyone else keeps the server's, until somebody wrote the key again.
 */
export function rejectShared(key) { if (pending.delete(key)) notify(); }

/** Forget the page-local values (a different scene was loaded). */
export function resetShared() { local.clear(); pending.clear(); notify(); }

/** `[value, set]` for a shared key; re-renders when anyone changes it. */
export function useShared(key, initial) {
  const subscribe = useCallback(cb => { subs.add(cb); return () => subs.delete(cb); }, []);
  const value = useSyncExternalStore(subscribe, () => getShared(key, initial), () => initial);
  const set = useCallback(v => setShared(key, typeof v === 'function' ? v(getShared(key, initial)) : v), [key, initial]);
  return [value, set];
}

/** The id of the peer holding `key`, or null; re-renders when it changes. */
export function useSharedOwner(key) {
  const subscribe = useCallback(cb => { subs.add(cb); return () => subs.delete(cb); }, []);
  return useSyncExternalStore(subscribe, () => sharedOwner(key), () => null);
}
