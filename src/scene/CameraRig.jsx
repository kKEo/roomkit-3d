import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, runtime } from '../state/store.js';
import { EASE } from '../lib/easing.js';
import { reducedMotion } from '../lib/env.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

function posAt(tr, e, out) {
  if (!tr.curve) return out.copy(tr.p1);
  const c = Math.min(1, Math.max(0, e));
  tr.curve.getPointAt(c, out);
  // easings like "back" overshoot 0..1 — extrapolate along the tangent
  if (e !== c) out.addScaledVector(tr.curve.getTangentAt(c), (e - c) * tr.len);
  return out;
}

/**
 * Flies the camera between POIs along an arc through the room centre:
 * eased position, look-ahead target, FOV "warp" and slight roll mid-flight,
 * mouse parallax and a view offset that keeps the subject clear of the panel.
 */
export function CameraRig() {
  const { camera } = useThree();
  const scene = useStore(s => s.scene);
  const nav = useStore(s => s.nav);
  const base = useRef(null);
  if (!base.current) base.current = { pos: new V3(...scene.camera.intro.position), tgt: new V3(...scene.camera.intro.target) };
  const transit = useRef(null);
  const tmp = useRef({ fwd: new V3(), right: new V3(), up: new V3(), look: new V3(), vo: { x: 0, y: 0 } }).current;

  useEffect(() => {
    if (!nav) return;
    const poi = useStore.getState().pois[nav.index];
    const b = base.current;
    const p0 = b.pos.clone(), p1 = new V3(...poi.camera.position), t1 = new V3(...poi.camera.target);
    const dist = p0.distanceTo(p1);
    let curve = null;
    if (dist > 0.01) {
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y = Math.min(scene.room.height - 0.6, mid.y + 1.2 + dist * 0.07);
      mid.lerp(new V3(0, mid.y, 0), 0.3);
      curve = new THREE.CatmullRomCurve3([p0, mid, p1], false, 'centripetal');
    }
    const f0 = b.tgt.clone().sub(p0).normalize(), f1 = t1.clone().sub(p1).normalize();
    transit.current = {
      curve, len: curve ? curve.getLength() : 0, p1, t0: b.tgt.clone(), t1,
      start: performance.now(),
      dur: nav.duration || (reducedMotion ? 450 : Math.min(2800, Math.max(1500, 1300 + dist * 55))),
      roll: Math.sign(new V3().crossVectors(f0, f1).y) || 1,
      index: nav.index, shown: false,
    };
    runtime.transiting = true;
  }, [nav, scene]);

  useFrame(({ size, clock }, delta) => {
    if (!scene) return; // store reset during hot reload
    const dt = Math.min(0.05, delta);
    const time = clock.elapsedTime;
    const st = useStore.getState();
    const { settings } = st;
    const b = base.current;

    let warpFov = 0, roll = 0;
    const tr = transit.current;
    if (tr) {
      const t = Math.min(1, (performance.now() - tr.start) / tr.dur);
      posAt(tr, EASE[settings.ease](t), b.pos);
      // the gaze leads the motion: rotation finishes before the flight does
      b.tgt.lerpVectors(tr.t0, tr.t1, EASE.cubic(Math.min(1, t * 1.3)));
      const bell = Math.sin(Math.PI * t);
      warpFov = bell * settings.warp;
      roll = settings.warp > 0 ? bell * 0.045 * tr.roll : 0;
      runtime.progress = t;
      if (t > 0.8 && !tr.shown) { tr.shown = true; st.showPanel(tr.index); }
      if (t >= 1) { transit.current = null; runtime.transiting = false; }
    }

    // parallax: mouse, or a slow autonomous drift on touch devices
    const { mouse, ms } = runtime;
    if (runtime.touch) { mouse.x = Math.sin(time * 0.25) * 0.5; mouse.y = Math.cos(time * 0.19) * 0.3; }
    const k = Math.min(1, dt * 3);
    ms.x += (mouse.x - ms.x) * k; ms.y += (mouse.y - ms.y) * k;
    tmp.fwd.subVectors(b.tgt, b.pos).normalize();
    tmp.right.crossVectors(tmp.fwd, UP).normalize();
    tmp.up.crossVectors(tmp.right, tmp.fwd);
    const P = settings.parallax;
    camera.position.copy(b.pos).addScaledVector(tmp.right, ms.x * P * 1.1).addScaledVector(tmp.up, -ms.y * P * 0.6);
    if (!reducedMotion) camera.position.y += Math.sin(time * 0.6) * 0.05;
    tmp.look.copy(b.tgt).addScaledVector(tmp.right, ms.x * P * 0.12);
    camera.lookAt(tmp.look);
    if (roll) camera.rotateZ(roll);
    camera.fov = (size.width < size.height ? scene.camera.fovPortrait : scene.camera.fov) + warpFov;

    // shift the frame so the subject isn't hidden under the content panel
    const w = size.width, h = size.height, narrow = w < 760;
    const open = !st.panelCollapsed && st.current >= 0;
    const tx = open && !narrow ? w * scene.effects.panelOffset : 0, ty = open && narrow ? h * 0.2 : 0;
    tmp.vo.x += (tx - tmp.vo.x) * k; tmp.vo.y += (ty - tmp.vo.y) * k;
    camera.setViewOffset(w, h, tmp.vo.x, tmp.vo.y, w, h);
    camera.updateProjectionMatrix();

    runtime.camera = camera;
    runtime.time = time;
    camera.position.toArray(runtime.camPos);
    tmp.fwd.toArray(runtime.camDir);
  });

  return null;
}
