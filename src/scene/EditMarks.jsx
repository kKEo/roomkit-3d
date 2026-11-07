import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, editGroups } from '../state/store.js';
import { useWorld } from './core.jsx';

/** The placed objects a tree key covers: one object, or every object of a stop (`stop:<file>`). */
function groupsOf(key) {
  if (!key) return [];
  if (!key.startsWith('stop:')) return editGroups.has(key) ? [editGroups.get(key)] : [];
  const prefix = `${key.slice(5)}:`;
  return [...editGroups].filter(([k]) => k.startsWith(prefix)).map(([, g]) => g);
}

function useBoxHelper(color, opacity) {
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(new THREE.Box3(), color);
    Object.assign(h.material, { transparent: opacity < 1, opacity, depthTest: false, toneMapped: false, fog: false });
    h.renderOrder = 10;
    return h;
  }, [color, opacity]);
  useEffect(() => () => { helper.geometry.dispose(); helper.material.dispose(); }, [helper]);
  return helper;
}

const scratch = new THREE.Box3();

/** Fits a helper's box around the objects of a key each frame (doors swing, screens slide), or hides it. */
function fit(helper, key) {
  const groups = groupsOf(key);
  helper.box.makeEmpty();
  for (const g of groups) helper.box.union(scratch.setFromObject(g));
  // a little larger than the object, so its lines do not hide in the object's own outline
  if (!helper.box.isEmpty()) helper.box.expandByScalar(0.08);
  helper.visible = !helper.box.isEmpty();
}

/**
 * The editor's marks in the room: a box around the selected object (or all of a selected stop's objects) and a
 * fainter one around the hovered one, drawn over everything so a box behind a wall still shows.
 */
export function EditMarks() {
  const { theme } = useWorld();
  const selected = useStore(s => s.edit?.selected);
  const hovered = useStore(s => s.edit?.hovered);
  const sel = useBoxHelper(theme.highlight, 1);
  const hov = useBoxHelper(theme.accent, 0.5);
  useFrame(() => {
    fit(sel, selected);
    fit(hov, hovered !== selected ? hovered : null);
  });
  return (
    <>
      <primitive object={sel} />
      <primitive object={hov} />
    </>
  );
}
