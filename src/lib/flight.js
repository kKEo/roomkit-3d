import * as THREE from 'three';

/**
 * The shape and timing of a camera flight, shared by the camera (src/scene/CameraRig.jsx) and the
 * avatars of other visitors (src/scene/Avatars.jsx), which replay a peer's flight from its intent
 * (from, to, duration, arc) instead of receiving its position ten times a second.
 */

/**
 * The path from `p0` to `p1` (THREE.Vector3): with `arc`, lifted through the room centre like a POI-to-POI
 * flight; otherwise a straight line (zooming into a screen). Null when the two points coincide.
 */
export function flightCurve(p0, p1, { arc = true, room } = {}) {
  const dist = p0.distanceTo(p1);
  if (dist <= 0.01) return null;
  if (!arc || !room) return new THREE.LineCurve3(p0.clone(), p1.clone());
  const mid = p0.clone().lerp(p1, 0.5);
  mid.y = Math.min(room.height - 0.6, mid.y + 1.2 + dist * 0.07);
  mid.lerp(new THREE.Vector3(room.centre[0], mid.y, room.centre[1]), 0.3);
  return new THREE.CatmullRomCurve3([p0.clone(), mid, p1.clone()], false, 'centripetal');
}

/** How long a flight over `dist` metres takes when the scene gives no duration. */
export const flightDuration = (dist, reducedMotion = false) => (reducedMotion ? 450 : Math.min(2800, Math.max(1500, 1300 + dist * 55)));

/**
 * Position along a flight `{ curve, len, p1 }` at eased progress `e` (0..1, may overshoot with "back"
 * easings: extrapolated along the tangent), written into `out`.
 */
export function posAt(tr, e, out) {
  if (!tr.curve) return out.copy(tr.p1);
  const c = Math.min(1, Math.max(0, e));
  tr.curve.getPointAt(c, out);
  if (e !== c) out.addScaledVector(tr.curve.getTangentAt(c), (e - c) * tr.len);
  return out;
}
