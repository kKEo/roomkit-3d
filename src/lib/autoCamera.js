import * as THREE from 'three';
import { objectMatrix } from './math.js';
import { clipSegment, containsPoint } from './footprint.js';

/**
 * Derive camera + marker placement for a POI from its first object when the
 * config leaves them out. Prefabs face local +Z; `focus` and `markerOffset`
 * are in the prefab's local space.
 */
/**
 * Default overview: outside the front (+z) wall and above the ceiling, looking in and down.
 * The shell only draws its inner faces, so from here the whole room shows like a cut-away model.
 * Works from the footprint's bounds, so an L-shaped room is framed like a rectangular one.
 */
export function overviewCamera({ width, height, depth, bounds, centre }) {
  const size = Math.max(width, depth);
  const cx = centre?.[0] ?? 0, cz = centre?.[1] ?? 0, maxZ = bounds?.maxZ ?? depth / 2;
  return {
    position: [cx, height + size * 0.22, maxZ + size * 0.28],
    target: [cx, 0, cz - depth * 0.06],
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

/**
 * Pulls a camera that stands outside the room back along its line of sight, to `margin` metres inside the
 * wall it crossed. A camera already inside, or one whose target is outside too, is returned as is.
 */
export function clampCamera(camera, footprint, margin = 0.6) {
  const [px, py, pz] = camera.position, [tx, , tz] = camera.target;
  if (containsPoint(footprint, px, pz)) return camera;
  const inside = clipSegment(footprint, tx, tz, px, pz)[0];
  if (!inside) return camera;
  const len = Math.hypot(px - tx, pz - tz), reach = Math.hypot(inside[2] - tx, inside[3] - tz);
  const d = Math.max(reach - margin, reach / 2);
  return { ...camera, position: [tx + ((px - tx) / len) * d, py, tz + ((pz - tz) / len) * d] };
}
