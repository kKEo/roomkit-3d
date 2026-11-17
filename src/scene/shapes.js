import * as THREE from 'three';

/** Geometry constructors by shape name; the keys are the `shape` values prefabs accept. */
export const GEOMETRIES = {
  box: THREE.BoxGeometry,
  cylinder: THREE.CylinderGeometry,
  cone: THREE.ConeGeometry,
  sphere: THREE.SphereGeometry,
  torus: THREE.TorusGeometry,
  torusKnot: THREE.TorusKnotGeometry,
  icosahedron: THREE.IcosahedronGeometry,
  dodecahedron: THREE.DodecahedronGeometry,
  octahedron: THREE.OctahedronGeometry,
  tetrahedron: THREE.TetrahedronGeometry,
  plane: THREE.PlaneGeometry,
};
export const SHAPES = Object.keys(GEOMETRIES);

/** Half extents [x, y, z] of a shape built with these constructor args, or null when the args do not say. */
export function shapeExtent(shape, args = []) {
  const [a, b, c] = args;
  const n = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  switch (shape) {
    case 'box': return n(a) && n(b) && n(c) ? [a / 2, b / 2, c / 2] : null;
    case 'cylinder': return n(a) && n(b) && n(c) ? [Math.max(a, b), c / 2, Math.max(a, b)] : null;
    case 'cone': return n(a) && n(b) ? [a, b / 2, a] : null;
    case 'plane': return n(a) && n(b) ? [a / 2, b / 2, 0.01] : null;
    case 'torus': return n(a) && n(b) ? [a + b, a + b, b] : null;
    case 'torusKnot': return n(a) && n(b) ? [a * 1.5 + b, a * 1.5 + b, a * 1.5 + b] : null; // the knot wanders about 1.5 radii out
    default: return n(a) ? [a, a, a] : null; // sphere and polyhedra: radius
  }
}

/** Geometry args for a shape fitting roughly a `size`-wide bounding box. */
export function shapeArgs(shape, size = 1) {
  switch (shape) {
    case 'torusKnot': return [size * 0.35, size * 0.11, 90, 8];
    case 'torus': return [size * 0.4, size * 0.12, 8, 24];
    case 'box': return [size * 0.7, size * 0.7, size * 0.7];
    case 'sphere': return [size / 2, 12, 8];
    case 'cone': return [size / 2, size, 6];
    case 'cylinder': return [size * 0.35, size * 0.35, size, 8];
    case 'plane': return [size, size];
    default: return [size / 2, 0]; // polyhedra: radius, detail
  }
}
