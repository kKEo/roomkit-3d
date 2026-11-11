import { createSyncClient } from './client.js';
import { runtime } from '../state/store.js';
import { useSync, syncClient, setSyncClient, PROFILE_KEY } from './syncStore.js';

export { useSync, syncClient };

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
let client = null, stop = null;


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

/**
 * What to tell the room right after a (re)connect, given the last intent this page reported (at local time
 * `lastAt`) and where the camera is now (`here`). Resending the last flight as it was would make every peer
 * replay it from its start: an avatar that sat at a POI would jump back and fly in again. So a visitor who is
 * parked is reported as parked where the camera is, one who flies by hand as flying from here, and only one
 * who is still in the middle of a flight gets the rest of that flight (straight on to where it was going).
 */
export function welcomeIntent(last, lastAt, here, transiting, now) {
  if (last?.kind === 'free') return { kind: 'free', from: here };
  if (last?.to && last.duration && transiting) {
    const left = last.duration - (now - lastAt);
    if (left > 150) return { ...last, from: here, duration: left, ease: 'linear', reverse: undefined };
  }
  return { kind: 'still', from: here };
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
    else if (what === 'reject') { useSync.setState({ rejected: arg }); console.warn('sync: rejected', arg); } // src/net/shared.js drops the write it refers to
  });
  // tell the newcomers (and the room after a reconnect) where this visitor is: still, where the camera is now
  client.onWelcome(() => {
    const c = client;
    const here = { position: [...runtime.pose.position], target: [...runtime.pose.target] };
    c.intent(welcomeIntent(c.lastIntent, c.lastIntentAt, here, runtime.transiting, Date.now()));
    publish();
  });
  setSyncClient(client);
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
  setSyncClient(null);
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
