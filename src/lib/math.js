import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const toRad = (r = [0, 0, 0]) => r.map(v => v * DEG);

/** Matrix for a config object { position, rotation (deg), scale }. */
export function objectMatrix({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }) {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...toRad(rotation))),
    new THREE.Vector3(...s),
  );
}

/** Flat list of segment endpoints for a circle in the XZ plane. */
export function circlePts(r, n, y = 0) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
    a.push(Math.cos(t0) * r, y, Math.sin(t0) * r, Math.cos(t1) * r, y, Math.sin(t1) * r);
  }
  return a;
}

/**
 * "#00ff66" + alpha -> "rgba(0,255,102,a)". Parsed in the working colour space so the
 * result is the literal CSS colour whatever THREE.ColorManagement.enabled is set to.
 */
export function rgba(css, a) {
  const c = new THREE.Color().setStyle(css, THREE.LinearSRGBColorSpace);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
