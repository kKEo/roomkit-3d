import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { useStore, editGroups } from '../state/store.js';
import { configRotation } from '../lib/math.js';

const MOVE_SNAP = 0.1, TURN_SNAP = THREE.MathUtils.degToRad(15);
const isObjectKey = k => typeof k === 'string' && !k.startsWith('stop:') && /:\d+$/.test(k);
const r2 = v => { const n = Math.round(v * 100) / 100; return Object.is(n, -0) ? 0 : n; };

/**
 * The editor's handles on the selected object (three.js TransformControls): arrows and planes to move it along the
 * room's axes, or rings to turn it (`edit.tool`, Move or Rotate). Moves snap to 10 cm and turns to 15°; Shift drags
 * freely; Esc puts the object back mid-drag. On release the editor writes the new `position` / `rotation` into the
 * object's file (`edit.transform`), one undo step. A drag on a handle never reaches the room: no selection, no
 * swipe to another stop. Loaded only by the editor (src/scene/Experience.jsx), so the viewer's bundle has none of it.
 */
export function Gizmo() {
  const { camera, gl } = useThree();
  const selected = useStore(s => s.edit?.selected);
  const tool = useStore(s => s.edit?.tool ?? 'move');
  const zoomed = useStore(s => s.zoom != null);
  const tc = useMemo(() => {
    const t = new TransformControls(camera, gl.domElement);
    t.setSpace('world');
    t.setSize(0.9);
    return t;
  }, [camera, gl]);
  const drag = useRef(null); // { key, position, rotation } at the start of a drag

  useEffect(() => () => { tc.detach(); tc.dispose(); }, [tc]);
  useEffect(() => { tc.setMode(tool === 'rotate' ? 'rotate' : 'translate'); }, [tc, tool]);

  useEffect(() => {
    const snap = free => { tc.setTranslationSnap(free ? null : MOVE_SNAP); tc.setRotationSnap(free ? null : TURN_SNAP); };
    snap(false);
    const onKey = e => {
      if (e.key === 'Shift') snap(e.type === 'keydown');
      else if (e.key === 'Escape' && e.type === 'keydown' && tc.dragging) { tc.reset(); tc.pointerUp(null); }
    };
    const onBlur = () => snap(false);
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    addEventListener('blur', onBlur);
    return () => { removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', onBlur); };
  }, [tc]);

  // a press on a handle is the gizmo's alone: TransformControls listens on the canvas itself, and these run after it there,
  // so they can keep the press, its release and its click from the room's own handlers further up (R3F, swipes)
  useEffect(() => {
    const el = gl.domElement;
    let busy = false;
    const down = e => { if (tc.dragging) { busy = true; e.stopPropagation(); } };
    const up = e => { if (busy) e.stopPropagation(); };
    const click = e => { if (busy) { busy = false; e.stopPropagation(); } };
    const hover = () => { if (tc.axis && !tc.dragging) document.body.style.cursor = 'grab'; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('click', click);
    el.addEventListener('pointermove', hover);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('click', click);
      el.removeEventListener('pointermove', hover);
    };
  }, [tc, gl]);

  useEffect(() => {
    const onDown = () => {
      const g = tc.object;
      drag.current = g && { key: useStore.getState().edit?.selected, position: g.position.clone(), rotation: g.rotation.clone() };
      document.body.style.cursor = 'grabbing';
    };
    const onUp = () => {
      document.body.style.cursor = '';
      const g = tc.object, start = drag.current;
      drag.current = null;
      if (!g || !start) return;
      const moved = !g.position.equals(start.position), turned = !g.rotation.equals(start.rotation);
      if (!moved && !turned) return;
      const ok = useStore.getState().edit?.transform?.(start.key, {
        position: moved ? g.position.toArray().map(r2) : undefined,
        rotation: turned ? configRotation(g.rotation) : undefined,
      });
      // the file could not take it (it does not parse): the object goes back to what the file says
      if (ok === false) { g.position.copy(start.position); g.rotation.copy(start.rotation); }
    };
    tc.addEventListener('mouseDown', onDown);
    tc.addEventListener('mouseUp', onUp);
    return () => { tc.removeEventListener('mouseDown', onDown); tc.removeEventListener('mouseUp', onUp); };
  }, [tc]);

  // follow the selection: the object's group can be replaced when the scene is rebuilt
  useFrame(() => {
    const g = !zoomed && isObjectKey(selected) ? editGroups.get(selected) : undefined;
    if (g === tc.object || tc.dragging) return;
    if (g) tc.attach(g); else tc.detach();
  });

  return <primitive object={tc.getHelper()} />;
}
