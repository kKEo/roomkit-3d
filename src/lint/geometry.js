import * as THREE from 'three';
import { objectMatrix } from '../lib/math.js';

/**
 * Where a scene's objects are, worked out from the config alone (no renderer): each placed object's box
 * from its prefab's `geometry()` (src/prefabs/registry.js), and the tests the scene checks run on them.
 * Floor plans are [x, z]; three.js maths only, so this runs in Node.
 */

/** Half the side of a pillar's base block (src/scene/Room.jsx). */
export const PILLAR_HALF = 0.75;

/** Every placed object with where it is written: `{ key, file, path, owner, obj }`; `owner` is the POI id, null for decor. */
export function sceneObjects(scene, pois) {
  return [
    ...scene.decor.map((obj, i) => ({ key: `decor:${i}`, file: `${scene.name}/scene.json`, path: `decor.${i}`, owner: null, obj })),
    ...pois.flatMap(p => p.objects.map((obj, i) => ({ key: `${p.id}:${i}`, file: `${scene.name}/${p.file}`, path: `objects.${i}`, owner: p.id, obj }))),
  ];
}

const scale3 = s => (Array.isArray(s) ? s : [s, s, s]);

/**
 * The object's box in the room, or null when its prefab declares no geometry for these props:
 * `{ poly, centre, origin, y0, y1, mount, front, round, radius, tilted, local, inverse }`.
 * `poly` is the floor outline (a 16-gon for a round object), `front` the unit [x, z] direction it faces,
 * `tilted` true when it is rotated about x or z, in which case the outline is not meaningful.
 */
export function objectBox(obj, registry) {
  let g;
  try { g = registry.get(obj.type)?.geometry?.(obj.props); } catch { g = null; }
  if (!g) return null;
  const m = objectMatrix(obj), s = scale3(obj.scale);
  const at = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(m); return [v.x, v.z]; };
  const centre = at((g.min[0] + g.max[0]) / 2, (g.min[2] + g.max[2]) / 2);
  const radius = ((g.max[0] - g.min[0]) / 2) * Math.max(s[0], s[2]);
  const poly = g.round
    ? Array.from({ length: 16 }, (_, i) => [centre[0] + Math.cos((i / 16) * Math.PI * 2) * radius, centre[1] + Math.sin((i / 16) * Math.PI * 2) * radius])
    : [at(g.min[0], g.min[2]), at(g.max[0], g.min[2]), at(g.max[0], g.max[2]), at(g.min[0], g.max[2])];
  const f = new THREE.Vector3(0, 0, g.front === '-z' ? -1 : 1).transformDirection(m);
  const fl = Math.hypot(f.x, f.z) || 1;
  return {
    poly, centre, radius, round: g.round, mount: g.mount, local: g,
    origin: [obj.position[0], obj.position[2]],
    y0: obj.position[1] + g.min[1] * s[1], y1: obj.position[1] + g.max[1] * s[1],
    front: [f.x / fl, f.z / fl],
    tilted: Math.abs(obj.rotation[0]) > 0.01 || Math.abs(obj.rotation[2]) > 0.01,
    inverse: m.clone().invert(),
  };
}

/** The square base of a pillar as an outline. */
export const pillarPoly = ([x, z]) => [[x - PILLAR_HALF, z - PILLAR_HALF], [x + PILLAR_HALF, z - PILLAR_HALF], [x + PILLAR_HALF, z + PILLAR_HALF], [x - PILLAR_HALF, z + PILLAR_HALF]];

/** How far two convex outlines reach into each other, in metres (separating axes); 0 when they are apart. */
export function penetration(a, b) {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-9) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const span = p => { let lo = Infinity, hi = -Infinity; for (const [x, z] of p) { const d = x * nx + z * nz; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
      const [a0, a1] = span(a), [b0, b1] = span(b);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap <= 0) return 0;
      least = Math.min(least, overlap);
    }
  }
  return least === Infinity ? 0 : least;
}

/** Whether a point (world [x, y, z]) is inside the box. */
export function pointInBox(box, p) {
  const v = new THREE.Vector3(...p).applyMatrix4(box.inverse), { min, max } = box.local;
  return v.x > min[0] && v.x < max[0] && v.y > min[1] && v.y < max[1] && v.z > min[2] && v.z < max[2];
}

/** Whether the straight line from `a` to `b` (world points) passes through the box; a round box is tested a little narrower. */
export function segmentHitsBox(box, a, b) {
  const p = new THREE.Vector3(...a).applyMatrix4(box.inverse), q = new THREE.Vector3(...b).applyMatrix4(box.inverse);
  const d = q.clone().sub(p), k = box.round ? 0.8 : 1;
  const min = [box.local.min[0] * k, box.local.min[1], box.local.min[2] * k], max = [box.local.max[0] * k, box.local.max[1], box.local.max[2] * k];
  let t0 = 0, t1 = 1;
  for (const [i, axis] of ['x', 'y', 'z'].entries()) {
    if (Math.abs(d[axis]) < 1e-9) { if (p[axis] < min[i] || p[axis] > max[i]) return false; continue; }
    let lo = (min[i] - p[axis]) / d[axis], hi = (max[i] - p[axis]) / d[axis];
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Where a camera sees each box: the share of the picture its outline covers (0–1, clipped to the frame) and
 * whether any of it is in view. A 16:9 picture; `fov` is the vertical angle in degrees.
 */
export function framing(camera, fov, box, aspect = 16 / 9) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 1000);
  cam.position.set(...camera.position);
  cam.lookAt(...camera.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const view = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, front = 0;
  for (const [x, z] of box.poly) for (const y of [box.y0, box.y1]) {
    const v = new THREE.Vector3(x, y, z);
    if (v.clone().applyMatrix4(view).z >= -0.05) continue; // behind the camera
    front++;
    v.project(cam);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  if (!front) return { visible: false, cover: 0, centre: null };
  const w = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX)), h = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
  return { visible: w > 0 && h > 0, cover: (w * h) / 4, centre: [(minX + maxX) / 2, (minY + maxY) / 2] };
}
