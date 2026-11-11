import { create } from 'zustand';

/**
 * The state of the viewer's connection to an event, and the live client's holder: the part of
 * src/net/sync.js that the shared state (src/net/shared.js) and the video sync read. It imports nothing
 * of the viewer, so those modules can be reached from the action registry without an import cycle
 * (sync.js imports the store, the store imports the registry, the registry imports shared.js).
 */
export const PROFILE_KEY = 'scene-rooms:profile';
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
  rejected: null,     // the server's latest `reject` (a new object each time), so the shared state can drop the write it refused
  rtt: null,
  rates: null,        // { inKb, outKb } per second, over the last couple of seconds
}));

let client = null;

/** The live client, or null outside an event. */
export const syncClient = () => client;
/** Set by src/net/sync.js when it starts or stops the client. */
export const setSyncClient = c => { client = c; };
