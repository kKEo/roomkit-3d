import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore, runtime, viewRect } from '../state/store.js';
import { getSession } from '../scene/screenState.js';
import { Terminal } from './screens/Terminal.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Form } from './blocks/index.jsx';

const FormScreen = ({ config }) => <Form data={config.form ?? {}} />;
const KINDS = { terminal: Terminal, dashboard: Dashboard, form: FormScreen };

/**
 * DOM layer pinned over the screen the camera is zoomed into. The camera faces the screen
 * head-on, so its projected corners give an axis-aligned rectangle; interactive sources
 * (terminal, dashboard, form) render real inputs there once the camera has arrived.
 */
export function ScreenOverlay() {
  const zoom = useStore(s => s.zoom);
  const ui = useStore(s => s.scene.ui);
  const exitZoom = useStore(s => s.exitZoom);
  const ref = useRef(null);

  useEffect(() => {
    if (!zoom) return;
    const c = new THREE.Vector3(...zoom.center), up = new THREE.Vector3(...zoom.up);
    const right = up.clone().cross(new THREE.Vector3(...zoom.normal));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
      c.clone().addScaledVector(right, (x * zoom.w) / 2).addScaledVector(up, (y * zoom.h) / 2));
    const v = new THREE.Vector3();
    let raf, ready = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current, cam = runtime.camera;
      if (!el || !cam) return;
      const { left, top, width: w, height: h } = viewRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of corners) {
        v.copy(p).project(cam);
        const x = left + ((v.x + 1) / 2) * w, y = top + ((1 - v.y) / 2) * h;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      el.style.setProperty('--su', `${Math.max(11, (y1 - y0) / 26)}px`);
      if (runtime.zoomReady !== ready) {
        ready = runtime.zoomReady;
        el.classList.toggle('on', ready);
        if (ready) el.querySelector('.screen-body input, .screen-body textarea, .screen-body button')?.focus({ preventScroll: true });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoom]);

  if (!zoom) return null;
  const Body = KINDS[zoom.screen.source];
  const back = <button type="button" className="zback" onClick={exitZoom} aria-label={ui.zoomBack}>← {ui.zoomBack} <kbd>Esc</kbd></button>;
  return (
    <div
      key={zoom.key} ref={ref} role="dialog" aria-label={zoom.screen.title || ui.zoomScreen}
      className={`screen-ui${Body ? ' live' : ''}`}
      style={zoom.screen.color ? { '--accent': zoom.screen.color } : undefined}
    >
      {Body ? (
        <>
          <header className="screen-title"><span>{zoom.screen.title}</span>{back}</header>
          <div className="screen-body"><Body config={zoom.screen} session={getSession(zoom.key, () => ({}))} ui={ui} /></div>
        </>
      ) : back}
    </div>
  );
}
