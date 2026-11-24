import { useEffect, useSyncExternalStore } from 'react';
import { syncClient, useSync } from './syncStore.js';
import { MAX_HOLDS } from './protocol.js';

/**
 * What the visitors of an event *hold open*: state that lasts only while somebody keeps it up, like the
 * wardrobe's doors while a visitor has its stop in focus, or a door ajar while a visitor is asked whether
 * to go through. Each page tells the room the keys it holds (`hold`, the whole short list at a time), and a
 * key counts as held while this page or any peer holds it. Nothing is stored: when a visitor leaves, what
 * it held goes with it, which the shared key → value state (./shared.js) could not promise.
 *
 * Outside an event only this page's own holds count, so a prefab behaves the same in a plain viewer.
 */
const mine = new Map();   // key → how many components of this page hold it
const subs = new Set();
let queued = false;
let sent = '[]';          // the list the server last got from this connection

const notify = () => { for (const cb of [...subs]) cb(); };
const subscribe = cb => { subs.add(cb); return () => subs.delete(cb); };

// a peer came, went or changed what it holds; the page joined or left an event
useSync.subscribe((s, prev) => { if (s.held !== prev.held || s.peers !== prev.peers || s.active !== prev.active) notify(); });

/**
 * Tells the room what this page holds, if that changed since it was last told. `fresh` after a `welcome`:
 * the server knows nothing of this connection's holds yet.
 */
export function sendHeld(fresh = false) {
  queued = false;
  if (fresh) sent = '[]';
  const c = syncClient();
  if (!c) return;
  const keys = [...mine.keys()].slice(0, MAX_HOLDS);
  const text = JSON.stringify(keys);
  if (text !== sent && c.hold(keys)) sent = text;
}

// several changes in one go (one stop let go, the next taken) travel as one message
function changed() {
  if (queued) return;
  queued = true;
  queueMicrotask(sendHeld);
}

/** Hold `key` open for everyone; returns the function that lets it go. Calls nest: the key is held until each is undone. */
export function hold(key) {
  key = String(key).slice(0, 200);
  mine.set(key, (mine.get(key) ?? 0) + 1);
  if (mine.get(key) === 1) changed();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = mine.get(key) - 1;
    if (n > 0) mine.set(key, n); else { mine.delete(key); changed(); }
  };
}

/** Whether another visitor of the event holds `key`. */
export function heldByPeer(key) {
  const c = syncClient();
  if (c) for (const p of c.peers.values()) if (p.holds?.includes(key)) return true;
  return false;
}

/** Whether anyone, this page included, holds `key`. */
export const isHeld = key => mine.has(key) || heldByPeer(key);

/**
 * Holds `key` open while `on` is true, and returns whether anyone in the event holds it: `on` itself in a
 * plain viewer. `const open = useHeld('vault', nearby)` opens the vault for everyone while one visitor is near.
 */
export function useHeld(key, on) {
  useEffect(() => (on && key ? hold(key) : undefined), [key, on]);
  const others = useSyncExternalStore(subscribe, () => heldByPeer(key), () => false);
  return !!on || others;
}
