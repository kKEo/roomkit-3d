/**
 * Per-screen state shared by a screen's canvas drawer and its zoomed-in DOM overlay
 * (terminal history, dashboard filters), so the 3D screen shows what was done up close.
 * Keys are scoped to the scene, so two scenes loaded in one session never share state.
 * Mounted screens also register here, so a `zoom` action can find one by key.
 */
const sessions = new Map();
const screens = new Map();
const videos = new Map();

export const sessionKey = (sceneName, poiId, screenId) => `${sceneName}:${poiId}:${screenId}`;

export function getSession(key, init) {
  if (!sessions.has(key)) sessions.set(key, init());
  return sessions.get(key);
}

/** A mounted screen announces how to build its zoom record; returns the unregister function. */
export function registerScreen(key, getRecord) {
  screens.set(key, getRecord);
  return () => { if (screens.get(key) === getRecord) screens.delete(key); };
}

/** The zoom-record builder of a mounted screen, or undefined. */
export const findScreen = key => screens.get(key);

/** A video screen announces its <video> element, so the zoomed-in overlay can steer playback. */
export function registerVideo(key, el) {
  videos.set(key, el);
  return () => { if (videos.get(key) === el) videos.delete(key); };
}

/** The <video> element behind a mounted video screen, or undefined. */
export const findVideo = key => videos.get(key);

/** Forget every session (a different scene was loaded). */
export function resetSessions() {
  sessions.clear();
}
