/**
 * Where the app may fetch from or import code from. No other imports, so the store and the data
 * hub can use it without pulling in the scene loader.
 */

/**
 * Where scene folders live. `VITE_SCENES_BASE` (build-time; absolute, or relative to the page)
 * lets one deployed viewer serve scenes published elsewhere; the default is `./scenes/` next to the app.
 */
export function scenesBase() {
  const base = import.meta.env.VITE_SCENES_BASE || `${import.meta.env.BASE_URL}scenes/`;
  return new URL(base.endsWith('/') ? base : `${base}/`, location.href);
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);

/** Whether `url`'s origin is the page's, the scenes', or one listed in `extra` (`*` allows any). */
export function originAllowed(url, extra) {
  const origin = new URL(url, location.href).origin;
  return origin === location.origin || origin === scenesBase().origin || extra.includes('*') || extra.includes(origin);
}

/**
 * Where a scene's own code (prefab and transform modules) may come from. Such a module runs with the
 * page's privileges, so by default only the scenes' own origin (and the page's) is trusted;
 * `VITE_PREFAB_ORIGINS` (build-time, comma-separated origins, or `*`) widens that.
 */
export function guardOrigin(url) {
  if (originAllowed(url, list(import.meta.env.VITE_PREFAB_ORIGINS))) return url;
  throw new Error(`blocked: ${new URL(url, location.href).origin} is not an allowed prefab origin (see VITE_PREFAB_ORIGINS)`);
}

/**
 * Where live data (screen and block feeds, and media URLs a feed hands back) may come from. Data is not
 * code, so any host that allows it with CORS is fine; `VITE_DATA_ORIGINS` (build-time, comma-separated)
 * restricts that to the page, the scenes' origin and the listed origins.
 */
export function guardData(url) {
  const allowed = list(import.meta.env.VITE_DATA_ORIGINS);
  if (!allowed.length || originAllowed(url, allowed)) return url;
  throw new Error(`blocked: ${new URL(url, location.href).origin} is not an allowed data origin (see VITE_DATA_ORIGINS)`);
}
