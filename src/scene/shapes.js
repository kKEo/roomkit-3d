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
