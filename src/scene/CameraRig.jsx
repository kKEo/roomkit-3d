import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, runtime } from '../state/store.js';
import { EASE } from '../lib/easing.js';
import { reducedMotion } from '../lib/env.js';
import { DEG } from '../lib/math.js';

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
 * Zooming into a screen flies straight to a head-on view of it and holds the camera still.
 */
export function CameraRig() {
  const { camera } = useThree();
  const getThree = useThree(s => s.get);
  const scene = useStore(s => s.scene);
  const nav = useStore(s => s.nav);
  const zoom = useStore(s => s.zoom);
  const base = useRef(null);
  if (!base.current) base.current = { pos: new V3(...scene.camera.intro.position), tgt: new V3(...scene.camera.intro.target) };
  const transit = useRef(null);
  const last = useRef({ nav: null, zoom: null });
  const tmp = useRef({ fwd: new V3(), right: new V3(), up: new V3(), look: new V3(), vo: { x: 0, y: 0 }, still: 0 }).current;

  // `arc`: lift the path through the room centre (POI to POI); otherwise fly straight (zoom in/out)
  function startTransit(p1, t1, { dur, arc = true, index = null, zoomed = false }) {
    const b = base.current;
    const p0 = b.pos.clone();
    const dist = p0.distanceTo(p1);
    let curve = null;
    if (dist > 0.01 && arc) {
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y = Math.min(scene.room.height - 0.6, mid.y + 1.2 + dist * 0.07);
      mid.lerp(new V3(0, mid.y, 0), 0.3);
      curve = new THREE.CatmullRomCurve3([p0, mid, p1], false, 'centripetal');
    } else if (dist > 0.01) curve = new THREE.LineCurve3(p0, p1);
    const f0 = b.tgt.clone().sub(p0).normalize(), f1 = t1.clone().sub(p1).normalize();
    transit.current = {
      curve, len: curve ? curve.getLength() : 0, p1, t0: b.tgt.clone(), t1,
      start: performance.now(),
      dur: dur || (reducedMotion ? 450 : Math.min(2800, Math.max(1500, 1300 + dist * 55))),
      roll: arc ? Math.sign(new V3().crossVectors(f0, f1).y) || 1 : 0,
      warp: arc, index, zoomed, shown: false,
    };
    runtime.transiting = true;
    runtime.zoomReady = false;
  }

  // camera of POI `i`, or the room overview for -1
  const viewOf = i => (i < 0 ? scene.camera.overview : useStore.getState().pois[i].camera);

  useEffect(() => {
    const prev = last.current;
    last.current = { nav, zoom };
    if (nav && nav !== prev.nav) {
      const view = viewOf(nav.index);
      startTransit(new V3(...view.position), new V3(...view.target), { dur: nav.duration, index: nav.index >= 0 ? nav.index : null });
    } else if (zoom && zoom !== prev.zoom) {
      // back off along the screen normal until the screen fills ~82% of the view
      const { size } = getThree();
      const fov = (size.width < size.height ? scene.camera.fovPortrait : scene.camera.fov) * DEG;
      const tan = Math.tan(fov / 2), aspect = size.width / size.height;
      const d = Math.max(zoom.h / 2 / tan, zoom.w / 2 / (tan * aspect)) / 0.82;
      const c = new V3(...zoom.center);
      startTransit(c.clone().addScaledVector(new V3(...zoom.normal), d), c, { dur: reducedMotion ? 300 : 900, arc: false, zoomed: true });
    } else if (!zoom && prev.zoom && nav) {
      const view = viewOf(nav.index);
      startTransit(new V3(...view.position), new V3(...view.target), { dur: reducedMotion ? 300 : 1000, arc: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, zoom, scene]);

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
      if (tr.warp) {
        warpFov = bell * settings.warp;
        roll = settings.warp > 0 ? bell * 0.045 * tr.roll : 0;
      }
      runtime.progress = t;
      if (t > 0.8 && !tr.shown && tr.index != null) { tr.shown = true; st.showPanel(tr.index); }
      if (t >= 1) { transit.current = null; runtime.transiting = false; runtime.zoomReady = tr.zoomed; }
    }

    // parallax: mouse, or a slow autonomous drift on touch devices
    const { mouse, ms } = runtime;
    if (runtime.touch) { mouse.x = Math.sin(time * 0.25) * 0.5; mouse.y = Math.cos(time * 0.19) * 0.3; }
    const k = Math.min(1, dt * 3);
    // zoomed in: hold the camera still so the DOM overlay stays pinned to the screen
    tmp.still += ((st.zoom ? 1 : 0) - tmp.still) * Math.min(1, dt * 6);
    const calm = 1 - tmp.still;
    ms.x += (mouse.x - ms.x) * k; ms.y += (mouse.y - ms.y) * k;
    tmp.fwd.subVectors(b.tgt, b.pos).normalize();
    tmp.right.crossVectors(tmp.fwd, UP).normalize();
    tmp.up.crossVectors(tmp.right, tmp.fwd);
    const P = settings.parallax * calm;
    camera.position.copy(b.pos).addScaledVector(tmp.right, ms.x * P * 1.1).addScaledVector(tmp.up, -ms.y * P * 0.6);
    if (!reducedMotion) camera.position.y += Math.sin(time * 0.6) * 0.05 * calm;
    tmp.look.copy(b.tgt).addScaledVector(tmp.right, ms.x * P * 0.12);
    camera.lookAt(tmp.look);
    if (roll) camera.rotateZ(roll);
    camera.fov = (size.width < size.height ? scene.camera.fovPortrait : scene.camera.fov) + warpFov;

    // shift the frame so the subject isn't hidden under the content panel
    const w = size.width, h = size.height, narrow = w < 760;
    const open = !st.panelCollapsed && st.current >= 0 && !st.zoom;
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
