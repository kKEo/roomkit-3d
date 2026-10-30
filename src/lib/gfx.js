/**
 * Rendering preferences of this visitor (Options → General). They belong to the device, not to a
 * scene, so they are kept in the browser's storage and survive reloads and scene changes.
 * `antialias` and `power` are fixed when the WebGL context is created, so they apply after a reload.
 */
export const GFX_DEFAULTS = {
  dpr: 'auto',             // 'auto' (device pixel ratio, 1–2) or a fixed render scale
  fps: 0,                  // frame-rate cap; 0 = as fast as the display refreshes
  particles: 1,            // share of the scene's dust particles drawn: 1, 0.5 or 0
  antialias: true,         // multisampled edges (reload)
  power: 'high-performance', // GPU preference: 'high-performance' | 'default' | 'low-power' (reload)
  hud: false,              // the small performance readout in the corner
};

export const GFX_CHOICES = {
  dpr: ['auto', 0.5, 0.75, 1, 1.5, 2],
  fps: [0, 120, 60, 30],
  particles: [1, 0.5, 0],
  power: ['high-performance', 'default', 'low-power'],
};

/** Settings that only a new WebGL context picks up. */
export const GFX_RELOAD = ['antialias', 'power'];

const KEY = 'roomkit.gfx';

/** The stored preferences, with anything missing or no longer valid replaced by its default. */
export function loadGfx(storage = globalThis.localStorage) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { /* private mode, blocked or corrupt */ }
  const out = { ...GFX_DEFAULTS };
  for (const k of Object.keys(GFX_DEFAULTS)) {
    const v = saved[k];
    if (GFX_CHOICES[k] ? GFX_CHOICES[k].includes(v) : typeof v === typeof GFX_DEFAULTS[k]) out[k] = v;
  }
  return out;
}

export function saveGfx(gfx, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(gfx)); } catch { /* private mode or blocked */ }
}

/** The `dpr` prop for the canvas. */
export const dprOf = gfx => (gfx.dpr === 'auto' ? [1, 2] : gfx.dpr);
