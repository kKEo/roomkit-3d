import { create } from 'zustand';
import { reducedMotion } from '../lib/env.js';

/**
 * React-facing state. Per-frame values (camera pose, smoothed mouse,
 * transition progress) live in `runtime` so they don't re-render React.
 */
export const useStore = create((set, get) => ({
  status: 'loading', // loading | ready | error
  error: null,
  scene: null,
  pois: [],
  current: -1,     // POI the camera is at / flying to; -1 = the room overview
  shown: -1,       // POI whose panel is visible
  hover: -1,
  started: false,
  panelCollapsed: false,
  markersVisible: true,
  settingsOpen: false,
  settings: { ease: 'quint', parallax: 0.8, warp: 12 },
  nav: null,       // { index (-1 = overview), duration, nonce } — consumed by CameraRig
  zoom: null,      // { key, poi, center, normal, up, w, h, screen } — screen the camera is zoomed into

  setLoaded: (scene, pois) => set({
    status: 'ready', scene, pois,
    markersVisible: scene.effects.markers,
    settings: {
      ease: scene.effects.ease,
      parallax: reducedMotion ? 0 : scene.effects.parallax,
      warp: reducedMotion ? 0 : scene.effects.warp,
    },
  }),
  setError: error => set({ status: 'error', error }),

  /** Fly to POI `i`, or to the whole-room overview with `i = -1`. */
  goTo: (i, duration) => {
    const { pois, current, shown, nav } = get();
    const n = pois.length;
    if (!n) return;
    i = i < 0 ? -1 : i % n;
    if (i === current && (i < 0 ? nav : shown === i)) { if (get().zoom) get().exitZoom(); return; }
    set({ current: i, shown: -1, started: true, zoom: null, nav: { index: i, duration, nonce: (nav?.nonce || 0) + 1 } });
    try { history.replaceState(null, '', location.pathname + location.search + (i < 0 ? '' : '#' + pois[i].id)); } catch { /* sandboxed */ }
  },
  home: () => get().goTo(-1),
  next: () => get().goTo(get().current + 1),
  prev: () => { const { current, pois } = get(); get().goTo(current <= 0 ? pois.length - 1 : current - 1); },
  showPanel: i => set({ shown: i }),
  setHover: i => set({ hover: i }),
  togglePanel: () => set(s => ({ panelCollapsed: !s.panelCollapsed })),
  toggleMarkers: () => {
    // hidden markers can't receive pointer-out, so drop any hover they held
    if (get().markersVisible) document.body.style.cursor = '';
    set(s => ({ markersVisible: !s.markersVisible, hover: -1 }));
  },
  zoomTo: rec => {
    if (get().zoom?.key === rec.key) return;
    document.body.style.cursor = '';
    set({ zoom: rec, hover: -1, settingsOpen: false });
  },
  exitZoom: () => set({ zoom: null }),
  toggleSettings: () => set(s => ({ settingsOpen: !s.settingsOpen })),
  setSetting: (k, v) => set(s => ({ settings: { ...s.settings, [k]: v } })),
}));

export const runtime = {
  mouse: { x: 0, y: 0 },        // target, -1..1
  ms: { x: 0, y: 0 },           // smoothed
  touch: false,
  camPos: [0, 0, 0],
  camDir: [0, 0, -1],
  camera: null,                 // set by CameraRig, read by DOM overlays
  time: 0,
  progress: 0,
  transiting: false,
  zoomReady: false,             // camera has arrived in front of the zoomed screen
};
