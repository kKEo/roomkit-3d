import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore, runtime } from '../state/store.js';
import { fmt, pad2 } from '../lib/text.js';

/** DOM labels pinned above each 3D marker (projected every frame, hidden off-screen / behind the camera). */
export function Labels() {
  const pois = useStore(s => s.pois);
  const current = useStore(s => s.current);
  const started = useStore(s => s.started);
  const ui = useStore(s => s.scene.ui);
  const goTo = useStore(s => s.goTo);
  const refs = useRef([]);

  useEffect(() => {
    const v = new THREE.Vector3();
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cam = runtime.camera;
      if (!cam) return;
      const w = innerWidth, h = innerHeight;
      pois.forEach((p, i) => {
        const el = refs.current[i];
        if (!el) return;
        const [x, y, z] = p.marker.position;
        // same bob as the 3D marker, plus clearance above it
        v.set(x, y + Math.sin(runtime.time * 1.4 + i) * 0.08 + 0.45, z).project(cam);
        const visible = !useStore.getState().zoom && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        el.classList.toggle('hidden', !visible);
        if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%,-100%)`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pois]);

  return (
    <div className="labels">
      {pois.map((p, i) => (
        <button
          key={p.id}
          ref={el => { refs.current[i] = el; }}
          type="button"
          className={`mlabel hidden${i === current ? ' here' : ''}${started ? '' : ' off'}`}
          aria-label={fmt(ui.goTo, { label: p.label })}
          onClick={() => goTo(i)}
        >
          <b>{pad2(i + 1)}</b>{p.label}
        </button>
      ))}
    </div>
  );
}
