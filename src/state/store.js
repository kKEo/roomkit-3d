import { create } from 'zustand';
import { reducedMotion } from '../lib/env.js';
import { resetSessions } from '../scene/screenState.js';
import { runAction } from '../actions/registry.js';
import { loadGfx, saveGfx, GFX_DEFAULTS } from '../lib/gfx.js';

const setHash = id => {
  try { history.replaceState(null, '', location.pathname + location.search + (id == null ? '' : '#' + id)); } catch { /* sandboxed or not a browser */ }
};
const setCursor = c => { if (typeof document !== 'undefined') document.body.style.cursor = c; };

/**
 * React-facing state. Per-frame values (camera pose, smoothed mouse,
 * transition progress) live in `runtime` so they don't re-render React.
 *
 * POIs are referred to by `id`, never by position in the list, so the list can be
 * reordered or replaced (an editor, a hot reload) without the selection going stale.
 * Navigation accepts an id, an index (wrapping; negative = overview) or null (overview).
 */
export const useStore = create((set, get) => ({
  status: 'loading', // loading | ready | error
  error: null,
  scene: null,
  pois: [],
  current: null,   // id of the POI the camera is at / flying to; null = the room overview
  shown: null,     // id of the POI whose panel is visible
  hover: null,     // id of the hovered marker
  started: false,
  panelCollapsed: false,
  markersVisible: true,
  optionsOpen: false,
  optionsTab: 'general', // general | camera | system
  settings: { ease: 'quint', parallax: 0.8, warp: 12 }, // camera settings, reset from each scene's effects
  gfx: loadGfx(),  // rendering preferences of this browser, see src/lib/gfx.js
  nav: null,       // { id (null = overview), duration, nonce } — consumed by CameraRig
  zoom: null,      // { key, poi (id), center, normal, up, w, h, screen } — screen the camera is zoomed into
  free: false,     // the visitor is flying the camera by hand (WASD, middle-drag); any navigation ends it

  /** Index of a POI id in `pois`, or -1. */
  indexOf: id => get().pois.findIndex(p => p.id === id),
  /** The id a navigation target means: an id (unknown ids and the overview give null) or a wrapping index. */
  resolve: target => {
    const { pois } = get();
    if (typeof target === 'number') return target < 0 || !pois.length ? null : pois[((target % pois.length) + pois.length) % pois.length].id;
    return pois.some(p => p.id === target) ? target : null;
  },

  /**
   * Install a loaded scene. A different scene starts fresh; the same scene again (a reload
   * while editing) keeps the visitor where they were, as far as its POIs still exist.
   */
  setLoaded: (scene, pois) => {
    const prev = get();
    const fresh = prev.scene?.name !== scene.name;
    if (fresh) resetSessions();
    const keep = id => (!fresh && pois.some(p => p.id === id) ? id : null);
    set({
      status: 'ready', error: null, scene, pois,
      current: keep(prev.current), shown: keep(prev.shown), hover: null, zoom: null, free: !fresh && prev.free,
      nav: fresh ? null : prev.nav,
      markersVisible: fresh ? scene.effects.markers : prev.markersVisible,
      settings: fresh ? {
        ease: scene.effects.ease,
        parallax: reducedMotion ? 0 : scene.effects.parallax,
        warp: reducedMotion ? 0 : scene.effects.warp,
      } : prev.settings,
    });
  },
  setError: error => set({ status: 'error', error }),

  /** Fly to a POI (id or index), or to the whole-room overview with null / a negative index. */
  goTo: (target, duration) => {
    const { pois, current, shown, nav } = get();
    if (!pois.length) return;
    const id = get().resolve(target);
    if (id === current && (id == null ? nav : shown === id)) { if (get().zoom) get().exitZoom(); return; }
    set({ current: id, shown: null, started: true, zoom: null, free: false, nav: { id, duration, nonce: (nav?.nonce || 0) + 1 } });
    setHash(id);
  },
  /** Take the camera by hand: leaves the current POI (and any flight to it) where the camera is now. */
  freeFly: () => {
    if (get().free || get().zoom) return;
    set({ free: true, current: null, shown: null, nav: null, started: true });
    setHash(null);
  },
  home: () => get().goTo(null),
  next: () => get().goTo(get().indexOf(get().current) + 1),
  prev: () => { const i = get().indexOf(get().current); get().goTo(i <= 0 ? get().pois.length - 1 : i - 1); },
  showPanel: id => set({ shown: id }),
  setHover: id => set({ hover: id }),
  togglePanel: () => set(s => ({ panelCollapsed: !s.panelCollapsed })),
  toggleMarkers: () => {
    // hidden markers can't receive pointer-out, so drop any hover they held
    if (get().markersVisible) setCursor('');
    set(s => ({ markersVisible: !s.markersVisible, hover: null }));
  },
  zoomTo: rec => {
    if (get().zoom?.key === rec.key) return;
    setCursor('');
    set({ zoom: rec, hover: null, optionsOpen: false });
  },
  exitZoom: () => set({ zoom: null }),
  toggleOptions: () => set(s => ({ optionsOpen: !s.optionsOpen })),
  setOptionsTab: tab => set({ optionsTab: tab }),
  setSetting: (k, v) => set(s => ({ settings: { ...s.settings, [k]: v } })),
  /** Change a rendering preference and remember it in this browser. */
  setGfx: (k, v) => { set(s => ({ gfx: { ...s.gfx, [k]: v } })); saveGfx(get().gfx); },
  resetGfx: () => { set({ gfx: { ...GFX_DEFAULTS } }); saveGfx(get().gfx); },
  /** Run a config action ({ type: 'goTo' | 'zoom' | 'openUrl' | 'togglePanel' | 'emit', … }); see src/actions/registry.js. */
  dispatch: action => runAction(action, get()),
}));

export const runtime = {
  mouse: { x: 0, y: 0 },        // target, -1..1
  ms: { x: 0, y: 0 },           // smoothed
  touch: false,
  camPos: [0, 0, 0],
  camDir: [0, 0, -1],
  camera: null,                 // set by CameraRig, read by DOM overlays
  view: { left: 0, top: 0, width: 0, height: 0 }, // the canvas rectangle on the page, set by CameraRig
  time: 0,
  progress: 0,
  transiting: false,
  zoomReady: false,             // camera has arrived in front of the zoomed screen
  gl: null,                     // the WebGLRenderer, set by Telemetry, read by Options → System
  glAttrs: null,                // { antialias, power } the WebGL context was created with, set by the Viewer
  stats: null,                  // live rendering figures while the probe runs, see src/scene/Telemetry.jsx
  fly: { keys: new Set(), slow: false, look: { x: 0, y: 0 }, dolly: 0 }, // free-fly input: held key codes, Shift, pending look (px) and wheel delta
};

/** The canvas rectangle the overlays project into; the whole window until the first frame. */
export function viewRect() {
  return runtime.view.width ? runtime.view : { left: 0, top: 0, width: innerWidth, height: innerHeight };
}
