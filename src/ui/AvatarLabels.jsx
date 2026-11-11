import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore, runtime, viewRect } from '../state/store.js';
import { syncClient, useSync } from '../net/sync.js';

const MAX_LABELS = 40;   // the nearest peers get a name tag
const MAX_DIST = 30;     // metres; further peers show no tag

/** Name tags above the avatars of the other visitors (projected every frame, like the POI labels). */
export function AvatarLabels() {
  const peers = useSync(s => s.peers);
  const refs = useRef(new Map());

  useEffect(() => {
    const v = new THREE.Vector3();
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cam = runtime.camera, client = syncClient();
      if (!cam || !client) return;
      const { left, top, width: w, height: h } = viewRect();
      const zoomed = !!useStore.getState().zoom;
      const c = runtime.camPos;
      // nearest first, so the tags that matter are the ones shown
      const near = [];
      for (const [id, el] of refs.current) {
        const p = client.peers.get(id);
        const d = p?.drawn;
        if (!d) { el.classList.add('hidden'); continue; }
        const dist = Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]);
        if (dist > MAX_DIST) { el.classList.add('hidden'); continue; }
        near.push({ el, d, dist });
      }
      near.sort((a, b) => a.dist - b.dist);
      near.forEach(({ el, d }, i) => {
        if (i >= MAX_LABELS || zoomed) { el.classList.add('hidden'); return; }
        v.set(d[0], d[1] + 0.35, d[2]).project(cam);
        const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        el.classList.toggle('hidden', !visible);
        if (visible) el.style.transform = `translate(${left + ((v.x + 1) / 2) * w}px, ${top + ((1 - v.y) / 2) * h}px) translate(-50%,-100%)`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="labels avatars" aria-hidden="true">
      {peers.map(p => (
        <span key={p.id} ref={el => { if (el) refs.current.set(p.id, el); else refs.current.delete(p.id); }} className="alabel hidden" style={{ '--who': p.color }}>
          {p.name}
        </span>
      ))}
    </div>
  );
}
