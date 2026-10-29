/**
 * Per-screen state shared by a screen's canvas drawer and its zoomed-in DOM overlay
 * (terminal history, dashboard filters), so the 3D screen shows what was done up close.
 */
const sessions = new Map();

export function getSession(key, init) {
  if (!sessions.has(key)) sessions.set(key, init());
  return sessions.get(key);
}
