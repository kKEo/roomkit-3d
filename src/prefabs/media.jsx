import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld, PoiContext, ActionsContext } from '../scene/core.jsx';
import { useStore } from '../state/store.js';
import { getSession, sessionKey, registerScreen } from '../scene/screenState.js';
import {
  createTextScreen, createGraphScreen, createStatsScreen, createOwnRain,
  createTerminalScreen, createDashboardScreen, createFormScreen,
} from '../scene/screens.js';
import { SCREEN_SOURCES, INTERACTIVE_SOURCES, screenSchema, isHls } from './screenSchema.js';
import { useLiveScreen } from '../data/live.js';

export { SCREEN_SOURCES, INTERACTIVE_SOURCES };

const WHITE = [1, 1, 1], BRIGHT = [1.35, 1.35, 1.35];

/** Scale/offset a texture so it covers a w×h plane without stretching. */
function cover(texture, w, h) {
  const img = texture.image;
  const iw = img?.videoWidth || img?.width, ih = img?.videoHeight || img?.height;
  if (!iw || !ih) return;
  const planeAspect = w / h, imgAspect = iw / ih;
  if (imgAspect > planeAspect) { texture.repeat.set(planeAspect / imgAspect, 1); texture.offset.set((1 - texture.repeat.x) / 2, 0); }
  else { texture.repeat.set(1, imgAspect / planeAspect); texture.offset.set(0, (1 - texture.repeat.y) / 2); }
  texture.needsUpdate = true;
}

/**
 * Loads an image or (muted, looping) video texture; null until ready or on failure. A video `src`
 * ending in `.m3u8` is an HLS stream: native where the browser plays HLS (Safari), else through
 * hls.js, fetched as its own chunk only then. Its segments must allow CORS, like any video texture.
 */
function useMediaTexture(source, src, w, h) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!src || (source !== 'image' && source !== 'video')) return;
    let tex = null, cancelled = false, video = null, hls = null;
    const ready = t => { if (cancelled) { t.dispose(); return; } cover(t, w, h); tex = t; setTexture(t); };
    if (source === 'image') {
      new THREE.TextureLoader().load(src, ready, undefined, () => console.warn(`Could not load image ${src}`));
    } else {
      video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      video.addEventListener('loadeddata', () => ready(new THREE.VideoTexture(video)), { once: true });
      video.addEventListener('error', () => console.warn(`Could not load video ${src}`), { once: true });
      if (!isHls(src) || video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.play().catch(() => {});
      } else {
        import('hls.js/light').then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) { console.warn(`Cannot play the HLS stream ${src} in this browser`); return; }
          hls = new Hls();
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            console.warn(`HLS stream ${src} failed: ${data.details}`);
            hls?.destroy();
            hls = null;
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          video.play().catch(() => {});
        }, e => console.warn(`Could not load the HLS player: ${e.message}`));
      }
    }
    return () => {
      cancelled = true;
      hls?.destroy();
      tex?.dispose();
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      setTexture(null);
    };
  }, [source, src, w, h]);
  return texture;
}

/**
 * Canvas-drawn screens (text, graph, stats, interactive kinds, or rain with its own caption/colour),
 * stepped ~20×/s. The drawer is made once per source (and session); new content, from a live feed or
 * an edit, goes to its `update`, so it is not rebuilt and its animation does not restart.
 */
function useCanvasScreen(source, config, session, status) {
  const { theme } = useWorld();
  const ownRain = source === 'rain' && (config.label != null || !!config.color);
  const rainColor = ownRain ? config.color : undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- later content arrives through screen.update below
  const screen = useMemo(() => makeCanvasScreen(theme, source, config, session, ownRain), [theme, source, session, ownRain, rainColor]);
  useEffect(() => () => screen?.dispose(), [screen]);
  const key = JSON.stringify(config);
  useEffect(() => { screen?.update(JSON.parse(key), status); }, [screen, key, status]);
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!screen) return;
    acc.current += dt;
    if (acc.current < 0.05) return;
    screen.step(Math.min(acc.current, 0.25));
    acc.current = 0;
  });
  return screen?.texture ?? null;
}

function makeCanvasScreen(theme, source, config, session, ownRain) {
  if (source === 'text') return createTextScreen(theme, config);
  if (source === 'graph') return createGraphScreen(theme, config);
  if (source === 'stats') return createStatsScreen(theme, config);
  if (source === 'terminal') return createTerminalScreen(theme, config, session);
  if (source === 'dashboard') return createDashboardScreen(theme, config, session);
  if (source === 'form') return createFormScreen(theme, config);
  if (ownRain) return createOwnRain(theme, config);
  return null;
}

/** The screen config keys; everything else a ScreenSurface gets goes to its mesh (position, rotation, …). */
const SCREEN_KEYS = new Set(Object.keys(screenSchema.shape));

/** World-space centre, normal, up and size of a screen mesh, for the zoom camera and overlay. */
function zoomRecord(mesh, w, h) {
  mesh.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  mesh.matrixWorld.decompose(pos, q, scale);
  return {
    center: pos.toArray(),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q).toArray(),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray(),
    w: w * scale.x, h: h * scale.y,
  };
}

/**
 * A w×h screen plane. `source`:
 *  - "rain"  shared Matrix rain with the POI caption; with `label` and/or `color`, its own rain
 *  - "image" / "video"  `src`, resolved from the scene folder
 *  - "text"  `title` + `lines` typed out terminal-style
 *  - "graph" `title` + `graph`: "wave" | "bars" | "radar"; `values` / `points` (+ `min`, `max`, `readout`) for real data
 *  - "stats" `title` + `stats`: big numbers with labels, units and deltas
 *  - "terminal" `title`, `prompt`, `lines`, `commands` — type commands once zoomed in
 *  - "dashboard" `title`, `rows`, `columns`, `filters`, `value` — filter a table once zoomed in
 *  - "form" `title`, `form` (same shape as the panel form block) — fill it in once zoomed in
 * `color` tints canvas-drawn screens. Shows the shared rain while loading or on failure.
 * Screens of a POI can be clicked to zoom in (unless `zoom` is false); `id` keeps their state stable
 * and is the hotspot name a scene can bind an action to instead (`actions: { <id>: … }`).
 * With `feed`, the fields above are placeholders: the feed's values are merged over them as they
 * arrive (src/data/live.js), and the title bar marks loading and errors.
 * The config shape is `screenSchema` in ./screenSchema.js; the loader has already validated it.
 */
export function ScreenSurface({ w, h, ...props }) {
  const config = {}, rest = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) (SCREEN_KEYS.has(k) ? config : rest)[k] = v;
  const { source = 'rain', zoom = true, id } = config;
  const { rain, name } = useWorld();
  const poi = useContext(PoiContext); // POI id, or null in decor
  const reactId = useId();
  const key = sessionKey(name, poi, id ?? reactId);
  const session = useMemo(() => (INTERACTIVE_SOURCES.includes(source) ? getSession(key, () => ({})) : null), [key, source]);
  const { config: live, status } = useLiveScreen(config);
  const { source: _s, zoom: _z, id: _i, feed: _f, ...content } = live;
  const media = useMediaTexture(source, live.src, w, h);
  const drawn = useCanvasScreen(source, content, session, status);
  const mesh = useRef(null);
  const [hovered, setHovered] = useState(false);
  const zoomed = useStore(s => s.zoom?.key === key);
  const action = useContext(ActionsContext)[id];
  useEffect(() => {
    if (!SCREEN_SOURCES.includes(source)) console.warn(`Unknown screen source "${source}" (known: ${SCREEN_SOURCES.join(', ')}); showing rain`);
  }, [source]);

  // let `zoom` actions (and anything else) find this screen by its key while it is mounted;
  // the record keeps the static config (with its feed), so the overlay follows the same live data
  const record = () => ({ key, poi, screen: config, ...zoomRecord(mesh.current, w, h) });
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => registerScreen(key, () => recordRef.current()), [key]);

  // clickable: inside a POI by default (fly there, then zoom in), or wherever an action is bound
  const selectable = !zoomed && (action ? true : zoom && poi != null);
  // handlers go away while zoomed in, so no pointer-out will arrive to clear the hover
  useEffect(() => { if (!selectable) setHovered(false); }, [selectable]);
  const handlers = selectable ? {
    onPointerOver: e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setHovered(false); document.body.style.cursor = ''; },
    onClick: e => {
      e.stopPropagation();
      if (e.delta >= 8) return; // a drag or swipe, not a click
      const st = useStore.getState();
      if (action) {
        // a bare { type: 'zoom' } means this very screen
        if (action.type === 'zoom' && !action.screen) st.zoomTo(record());
        else st.dispatch(action);
      } else if (st.current !== poi) st.dispatch({ type: 'goTo', poi });
      else st.zoomTo(record());
    },
  } : {};

  return (
    <mesh ref={mesh} {...rest} {...handlers}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={media || drawn || rain.texture} color={hovered && selectable ? BRIGHT : WHITE} toneMapped={false} />
    </mesh>
  );
}
