import { createContext, useContext, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/** { mats, rain, room, theme } for everything inside the Canvas. */
export const WorldContext = createContext(null);
export const useWorld = () => useContext(WorldContext);

/** Index of the POI an object belongs to; -1 for decor. */
export const PoiContext = createContext(-1);

const GEOMETRIES = {
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

function useDisposable(factory, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(factory, deps);
  useEffect(() => () => obj.dispose(), [obj]);
  return obj;
}

export function useGeometry(shape, args) {
  const Geo = GEOMETRIES[shape] || THREE.BoxGeometry;
  return useDisposable(() => new Geo(...args), [Geo, JSON.stringify(args)]);
}

/** Edge outline of a geometry; fat (pixel-width) lines for LineMaterial, 1px otherwise. */
export function Outline({ geometry, line = 'thick', threshold = 20 }) {
  const { mats } = useWorld();
  const material = mats.lines[line];
  const obj = useMemo(() => {
    const edges = new THREE.EdgesGeometry(geometry, threshold);
    if (!material.isLineMaterial) return new THREE.LineSegments(edges, material);
    const g = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    edges.dispose();
    return new LineSegments2(g, material);
  }, [geometry, material, threshold]);
  useEffect(() => () => obj.geometry.dispose(), [obj]);
  return <primitive object={obj} />;
}

/**
 * Hatched mesh with an outline — the basic building block of every prefab.
 * fill: 'main' | 'fine' | false (outline only); line: 'thick' | 'mid' | 'thin' | 'faint' | 'glow' | false
 */
export function Solid({ shape = 'box', args = [1, 1, 1], fill = 'main', line = 'thick', threshold, children, ...rest }) {
  const { mats } = useWorld();
  const geometry = useGeometry(shape, args);
  const outline = line && <Outline geometry={geometry} line={line} threshold={threshold} />;
  if (!fill) return <group {...rest}>{outline}{children}</group>;
  return (
    <mesh geometry={geometry} material={mats.fills[fill]} {...rest}>
      {outline}
      {children}
    </mesh>
  );
}

/** Line segments from a flat [x,y,z, x,y,z, ...] array. */
export function Segs({ points, line = 'thin', ...rest }) {
  const { mats } = useWorld();
  const material = mats.lines[line];
  const key = JSON.stringify(points);
  const obj = useMemo(() => {
    if (material.isLineMaterial) return new LineSegments2(new LineSegmentsGeometry().setPositions(points), material);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(g, material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, material]);
  useEffect(() => () => obj.geometry.dispose(), [obj]);
  return <primitive object={obj} {...rest} />;
}

/** Turns a polyline [V3...] into segment pairs for <Segs>. */
export function polylineToSegs(pts) {
  const a = [];
  for (let j = 0; j < pts.length - 1; j++) a.push(pts[j].x, pts[j].y, pts[j].z, pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);
  return a;
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
