import * as THREE from 'three';
import { objectMatrix } from './math.js';

/**
 * Derive camera + marker placement for a POI from its first object when the
 * config leaves them out. Prefabs face local +Z; `focus` and `markerOffset`
 * are in the prefab's local space.
 */
/** Default overview: in front of the room, a little above the ceiling (the shell is invisible from outside), looking in and down. */
export function overviewCamera({ width, height, depth }) {
  const size = Math.max(width, depth);
  return {
    position: [0, height + size * 0.08, depth / 2 + size * 0.22],
    target: [0, height * 0.12, -depth * 0.12],
  };
}

export function autoPlacement(obj, prefabDefaults) {
  const m = objectMatrix(obj);
  const focus = new THREE.Vector3(...prefabDefaults.focus).applyMatrix4(m);
  const front = new THREE.Vector3(0, 0, 1).transformDirection(m).setY(0).normalize();
  const pos = focus.clone().addScaledVector(front, prefabDefaults.cameraDistance);
  pos.y = prefabDefaults.cameraHeight ?? focus.y + 0.3;
  const marker = new THREE.Vector3(...prefabDefaults.markerOffset).applyMatrix4(m);
  return {
    camera: { position: pos.toArray(), target: focus.toArray() },
    marker: { position: marker.toArray() },
  };
}
