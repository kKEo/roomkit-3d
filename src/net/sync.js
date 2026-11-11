import { create } from 'zustand';
import { createSyncClient } from './client.js';
import { runtime } from '../state/store.js';

/**
 * The viewer's live connection to an event (browser glue around src/net/client.js). Started by the
 * App once the scene is loaded, when the page is part of an event: `?event=<name>` in the address, or
 * `multiplayer.event` in scene.json. The server is `?sync=<ws url>`, `multiplayer.url`, or the page's
 * own origin (the dev server proxies /ws to the sync server, see vite.config.js).
 *
 * React reads `useSync` (status, who is here, the shared state version); the scene reads the client's
 * `peers` map every frame (src/scene/Avatars.jsx); the camera reports where this visitor goes through
 * `presence` (src/scene/CameraRig.jsx). Nothing here does anything until `startSync` has run, so a
 * page outside an event costs nothing.
 */
const PROFILE_KEY = 'scene-rooms:profile';
const COLORS = ['#ff5c5c', '#ffb347', '#ffe66d', '#7ddc7d', '#4de3ff', '#6f8cff', '#c77dff', '#ff7ad9', '#00ff66', '#f5f5f5'];

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (p && typeof p.name === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)) return p;
  } catch { /* none yet */ }
  return { name: `Visitor ${Math.floor(1000 + Math.random() * 9000)}`, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
}

export const useSync = create(() => ({
  active: false,      // the page is part of an event
  status: 'idle',     // idle | connecting | online | reconnecting | closed
  event: null,
  me: null,           // { id, name, color }
  peers: [],          // [{ id, name, color }], for lists; poses live in the client
  profile: loadProfile(),
  version: 0,         // bumps on every shared-state change, for React subscribers (src/net/shared.js)
  rtt: null,
  rates: null,        // { inKb, outKb } per second, over the last couple of seconds
}));

let client = null, stop = null;

/** The live client, or null outside an event. */
export const syncClient = () => client;


/** The event and server this page should join, from the address and the scene; null when it is not part of one. */
export function syncTarget(scene) {
  const q = new URLSearchParams(location.search);
  const event = q.get('event') || scene.multiplayer?.event || null;
  if (!event || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(event)) return null;
  let url = q.get('sync') || scene.multiplayer?.url || location.origin.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(url)) return null;
  url = url.replace(/\/+$/, '');
  return { event, url };
}

/** Joins the event the page is part of (once per scene); returns a function that leaves it. */
export function startSync(scene) {
  stop?.();
  const target = syncTarget(scene);
  if (!target) return () => {};
  const { profile } = useSync.getState();
  client = createSyncClient({
    ...target, scene: scene.name, profile: { ...profile },
    WebSocket: window.WebSocket, storage: window.sessionStorage,
  });
  const publish = () => {
    const c = client;
    if (!c) return;
    useSync.setState({ status: c.status, me: c.me, peers: [...c.peers.values()].map(({ id, name, color }) => ({ id, name, color })), rtt: c.stats.rtt });
  };
  client.subscribe((what, arg) => {
    if (what === 'status' || what === 'peers') publish();
    else if (what === 'state' || what === 'lease') useSync.setState(s => ({ version: s.version + 1 }));
    else if (what === 'reject') console.warn('sync: rejected', arg);
  });
  // tell the newcomers (and the room after a reconnect) where this visitor is: still, where the camera is now
  client.onWelcome(() => {
    const c = client;
    const last = c.lastIntent;
    if (last && last.kind !== 'free') c.intent(last);
    else c.intent({ kind: last ? 'free' : 'still', from: { position: [...runtime.pose.position], target: [...runtime.pose.target] } });
    publish();
  });
  useSync.setState({ active: true, event: target.event, status: 'connecting' });
  client.connect();
  let last = { ...client.stats, at: performance.now() };
  const rttTimer = setInterval(() => {
    if (!client) return;
    const s = client.stats, t = performance.now(), dt = Math.max(0.001, (t - last.at) / 1000);
    useSync.setState({ rtt: s.rtt, rates: { inKb: (s.bytesIn - last.bytesIn) / 1024 / dt, outKb: (s.bytesOut - last.bytesOut) / 1024 / dt } });
    last = { ...s, at: t };
  }, 2000);
  // back from a background tab (whose timers the browser slowed down): reconnect or ping at once
  const onVisible = () => { if (!document.hidden) client?.retryNow(); };
  document.addEventListener('visibilitychange', onVisible);
  stop = () => { clearInterval(rttTimer); document.removeEventListener('visibilitychange', onVisible); stop = null; stopSync(); };
  return stop;
}

export function stopSync() {
  if (!client) return;
  client.close();
  client = null;
  useSync.setState({ active: false, status: 'idle', me: null, peers: [], rtt: null, rates: null });
}

/** Change this visitor's name or colour (remembered in this browser, announced to the room). */
export function setProfile(patch) {
  const profile = { ...useSync.getState().profile, ...patch };
  if (!profile.name.trim()) profile.name = 'Visitor';
  profile.name = profile.name.slice(0, 24);
  useSync.setState({ profile });
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* private mode */ }
  if (client) { client.setProfile(profile); useSync.setState({ me: client.me }); }
}

/** What the camera reports; no-ops outside an event. */
export const presence = {
  flight: intent => { client?.intent(intent); },
  pose: (pos, tgt) => { client?.pose(pos.toArray ? pos.toArray() : pos, tgt.toArray ? tgt.toArray() : tgt); },
};
