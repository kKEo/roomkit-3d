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
  current: -1,     // POI the camera is at / flying to
  shown: -1,       // POI whose panel is visible
  hover: -1,
  started: false,
  panelCollapsed: false,
  markersVisible: true,
  settingsOpen: false,
  settings: { ease: 'quint', parallax: 0.8, warp: 12 },
  nav: null,       // { index, duration, nonce } — consumed by CameraRig

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

  goTo: (i, duration) => {
    const { pois, current, shown, nav } = get();
    const n = pois.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === current && shown === i) return;
    set({ current: i, shown: -1, started: true, nav: { index: i, duration, nonce: (nav?.nonce || 0) + 1 } });
    try { history.replaceState(null, '', location.search + '#' + pois[i].id); } catch { /* sandboxed */ }
  },
  next: () => get().goTo(get().current + 1),
  prev: () => get().goTo(get().current - 1),
  showPanel: i => set({ shown: i }),
  setHover: i => set({ hover: i }),
  togglePanel: () => set(s => ({ panelCollapsed: !s.panelCollapsed })),
  toggleMarkers: () => {
    // hidden markers can't receive pointer-out, so drop any hover they held
    if (get().markersVisible) document.body.style.cursor = '';
    set(s => ({ markersVisible: !s.markersVisible, hover: -1 }));
  },
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
};
