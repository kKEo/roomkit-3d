import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld, PoiContext } from '../scene/core.jsx';
import { useStore } from '../state/store.js';
import { getSession } from '../scene/screenState.js';
import {
  createTextScreen, createGraphScreen, createOwnRain,
  createTerminalScreen, createDashboardScreen, createFormScreen,
} from '../scene/screens.js';

export const SCREEN_SOURCES = ['rain', 'image', 'video', 'text', 'graph', 'terminal', 'dashboard', 'form'];
/** Sources with a DOM overlay you can use once zoomed in. */
export const INTERACTIVE_SOURCES = ['terminal', 'dashboard', 'form'];

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

/** Loads an image or (muted, looping) video texture; null until ready or on failure. */
function useMediaTexture(source, src, w, h) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!src || (source !== 'image' && source !== 'video')) return;
    let tex = null, cancelled = false, video = null;
    const ready = t => { if (cancelled) { t.dispose(); return; } cover(t, w, h); tex = t; setTexture(t); };
    if (source === 'image') {
      new THREE.TextureLoader().load(src, ready, undefined, () => console.warn(`Could not load image ${src}`));
    } else {
      video = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      video.addEventListener('loadeddata', () => ready(new THREE.VideoTexture(video)), { once: true });
      video.addEventListener('error', () => console.warn(`Could not load video ${src}`), { once: true });
      video.play().catch(() => {});
    }
    return () => {
      cancelled = true;
      tex?.dispose();
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      setTexture(null);
    };
  }, [source, src, w, h]);
  return texture;
}

/** Canvas-drawn screens (text, graph, interactive kinds, or rain with its own caption/colour), refreshed ~20×/s. */
function useCanvasScreen(source, options, session) {
  const { theme } = useWorld();
  const key = JSON.stringify(options);
  const screen = useMemo(() => {
    const o = JSON.parse(key);
    if (source === 'text') return createTextScreen(theme, o);
    if (source === 'graph') return createGraphScreen(theme, o);
    if (source === 'terminal') return createTerminalScreen(theme, o, session);
    if (source === 'dashboard') return createDashboardScreen(theme, o, session);
    if (source === 'form') return createFormScreen(theme, o);
    if (source === 'rain' && (o.label != null || o.color)) return createOwnRain(theme, o);
    return null;
  }, [theme, source, key, session]);
  useEffect(() => () => screen?.dispose(), [screen]);
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
 *  - "graph" `title` + `graph`: "wave" | "bars" | "radar"
 *  - "terminal" `title`, `prompt`, `lines`, `commands` — type commands once zoomed in
 *  - "dashboard" `title`, `rows`, `columns`, `filters`, `value` — filter a table once zoomed in
 *  - "form" `title`, `form` (same shape as the panel form block) — fill it in once zoomed in
 * `color` tints canvas-drawn screens. Shows the shared rain while loading or on failure.
 * Screens of a POI can be clicked to zoom in (unless `zoom` is false); `id` keeps their state stable.
 */
export function ScreenSurface({
  source = 'rain', src, label, title, lines, graph, color,
  prompt, commands, rows, columns, filters, value, form,
  zoom = true, id, w, h, ...rest
}) {
  const { rain } = useWorld();
  const poi = useContext(PoiContext);
  const reactId = useId();
  const key = `${poi}:${id ?? reactId}`;
  const session = useMemo(() => (INTERACTIVE_SOURCES.includes(source) ? getSession(key, () => ({})) : null), [key, source]);
  const config = { source, src, label, title, lines, graph, color, prompt, commands, rows, columns, filters, value, form };
  const media = useMediaTexture(source, src, w, h);
  const drawn = useCanvasScreen(source, { label, title, lines, graph, color, prompt, commands, rows, columns, filters, value, form }, session);
  const mesh = useRef(null);
  const [hovered, setHovered] = useState(false);
  const zoomed = useStore(s => s.zoom?.key === key);
  useEffect(() => {
    if (!SCREEN_SOURCES.includes(source)) console.warn(`Unknown screen source "${source}" (known: ${SCREEN_SOURCES.join(', ')}); showing rain`);
  }, [source]);

  const selectable = zoom && poi >= 0 && !zoomed;
  // handlers go away while zoomed in, so no pointer-out will arrive to clear the hover
  useEffect(() => { if (!selectable) setHovered(false); }, [selectable]);
  const handlers = selectable ? {
    onPointerOver: e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setHovered(false); document.body.style.cursor = ''; },
    onClick: e => {
      e.stopPropagation();
      if (e.delta >= 8) return; // a drag or swipe, not a click
      const st = useStore.getState();
      if (st.current !== poi) st.goTo(poi);
      else st.zoomTo({ key, poi, screen: config, ...zoomRecord(mesh.current, w, h) });
    },
  } : {};

  return (
    <mesh ref={mesh} {...rest} {...handlers}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={media || drawn || rain.texture} color={hovered && selectable ? BRIGHT : WHITE} toneMapped={false} />
    </mesh>
  );
}
