import { createHub } from './hub.js';
import { guardData } from '../config/origins.js';

/** Largest response a feed accepts, in bytes. */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fetches a feed's JSON. No cookies or credentials are sent, the HTTP cache is bypassed, and an HTML
 * answer (a dev server or SPA fallback for a wrong path) is an error rather than a parse failure.
 * `guard` is applied to where a redirect lands as well, so an allowed host cannot forward to a blocked one.
 */
export async function fetchJson(url, signal, guard = u => u) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  if (res.redirected) {
    try { guard(res.url); } catch (e) { throw new Error(`redirected and ${e.message}`); }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if ((res.headers.get('content-type') || '').includes('text/html')) throw new Error('got an HTML page, not JSON (wrong URL?)');
  const size = Number(res.headers.get('content-length'));
  if (size > MAX_BYTES) throw new Error(`response too large (${size} bytes)`);
  const text = await readText(res, MAX_BYTES);
  try { return JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
}

/**
 * The body as text, read in chunks and abandoned as soon as it passes `max` bytes: a declared length
 * is not to be trusted, and a chunked answer declares none. Without streams (a test double) it is
 * read whole and checked after.
 */
async function readText(res, max) {
  if (typeof res.body?.getReader !== 'function') {
    const text = await res.text();
    if (text.length > max) throw new Error(`response too large (${text.length} characters)`);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      reader.cancel().catch(() => {});
      throw new Error(`response too large (over ${max} bytes)`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const visibility = typeof document === 'undefined' ? null : {
  hidden: () => document.hidden,
  onChange: cb => document.addEventListener('visibilitychange', cb),
};

/** The app's one feed hub (see ./hub.js). */
export const feeds = createHub({ fetchJson, EventSource: globalThis.EventSource, guard: guardData, visibility, maxBytes: MAX_BYTES });
