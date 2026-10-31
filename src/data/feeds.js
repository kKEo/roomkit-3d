import { createHub } from './hub.js';
import { guardData } from '../config/origins.js';

/** Largest response a feed accepts, in bytes. */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fetches a feed's JSON. No cookies or credentials are sent, the HTTP cache is bypassed, and an HTML
 * answer (a dev server or SPA fallback for a wrong path) is an error rather than a parse failure.
 */
export async function fetchJson(url, signal) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if ((res.headers.get('content-type') || '').includes('text/html')) throw new Error('got an HTML page, not JSON (wrong URL?)');
  const size = Number(res.headers.get('content-length'));
  if (size > MAX_BYTES) throw new Error(`response too large (${size} bytes)`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`response too large (${text.length} characters)`);
  try { return JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
}

const visibility = typeof document === 'undefined' ? null : {
  hidden: () => document.hidden,
  onChange: cb => document.addEventListener('visibilitychange', cb),
};

/** The app's one feed hub (see ./hub.js). */
export const feeds = createHub({ fetchJson, EventSource: globalThis.EventSource, guard: guardData, visibility });
