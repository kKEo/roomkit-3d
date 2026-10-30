import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { GEOMETRIES, SHAPES, shapeArgs } from './shapes.js';
import { useStore } from '../state/store.js';

export { SHAPES, shapeArgs };

/** { name, mats, rain, room, theme } for everything inside the Canvas. */
export const WorldContext = createContext(null);
export const useWorld = () => useContext(WorldContext);

/** Id of the POI an object belongs to; null for decor. */
export const PoiContext = createContext(null);

/** The placed object's `actions` ({ hotspotName: action }), provided by PlacedObject. */
export const ActionsContext = createContext({});

/**
 * Pointer handlers for a named hotspot: a hand cursor, `hot` while hovered, and the bound
 * action dispatched on click (not on a drag). Empty when the scene binds nothing to it.
 */
export function useHotspot(name) {
  const actions = useContext(ActionsContext);
  const action = name ? actions[name] : undefined;
  const [hot, setHot] = useState(false);
  useEffect(() => { if (!action) setHot(false); }, [action]);
  if (!action) return { hot: false, handlers: {} };
  return {
    hot,
    handlers: {
      onPointerOver: e => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; },
      onPointerOut: () => { setHot(false); document.body.style.cursor = ''; },
      onClick: e => { e.stopPropagation(); if (e.delta < 8) useStore.getState().dispatch(action); },
    },
  };
}

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
 * hotspot: a name the scene can bind an action to (see useHotspot); the outline glows while hovered.
 */
export function Solid({ shape = 'box', args = [1, 1, 1], fill = 'main', line = 'thick', threshold, hotspot, children, ...rest }) {
  const { mats } = useWorld();
  const geometry = useGeometry(shape, args);
  const { hot, handlers } = useHotspot(hotspot);
  const outline = line && <Outline geometry={geometry} line={hot ? 'glow' : line} threshold={threshold} />;
  if (!fill) return <group {...rest} {...handlers}>{outline}{children}</group>;
  return (
    <mesh geometry={geometry} material={mats.fills[fill]} {...rest} {...handlers}>
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
