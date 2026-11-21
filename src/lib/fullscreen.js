/**
 * The page in full screen, without the browser's bars: what the button at the right end of the top bar does on a
 * touchscreen. Safari on older iPads knows the calls only with the `webkit` prefix; on an iPhone there are none, and
 * `canFullscreen` says so.
 */

const doc = () => (typeof document === 'undefined' ? null : document);

/** The browser lets a page go full screen. */
export function canFullscreen(d = doc()) {
  if (!d) return false;
  const el = d.documentElement;
  if (el.requestFullscreen) return d.fullscreenEnabled !== false;
  return !!el.webkitRequestFullscreen && d.webkitFullscreenEnabled !== false;
}

/** The page is in full screen now. */
export function isFullscreen(d = doc()) {
  return !!d && !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Enters full screen, or leaves it. A refusal (no user gesture, a policy) leaves the page as it was. */
export function toggleFullscreen(d = doc()) {
  if (!d) return;
  const el = d.documentElement;
  const call = isFullscreen(d)
    ? d.exitFullscreen ?? d.webkitExitFullscreen
    : el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!call) return;
  try {
    const done = call.call(isFullscreen(d) ? d : el);
    done?.catch?.(() => {});
  } catch { /* refused: nothing changes */ }
}

/** Calls `fn(isFullscreen)` whenever the page enters or leaves full screen; returns what stops it. */
export function onFullscreenChange(fn, d = doc()) {
  if (!d) return () => {};
  const tell = () => fn(isFullscreen(d));
  d.addEventListener('fullscreenchange', tell);
  d.addEventListener('webkitfullscreenchange', tell);
  return () => {
    d.removeEventListener('fullscreenchange', tell);
    d.removeEventListener('webkitfullscreenchange', tell);
  };
}
