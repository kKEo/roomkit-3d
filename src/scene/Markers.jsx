import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store.js';
import { Solid, Segs, useWorld } from './core.jsx';
import { circlePts } from '../lib/math.js';

const tmp = new THREE.Vector3();

/** `phase` offsets the bob so neighbouring markers don't move in step (the same phase Labels uses). */
function Marker({ poi, phase }) {
  const { mats } = useWorld();
  const g = useRef(), m = useRef();
  const hovered = useStore(s => s.hover === poi.id);
  const here = useStore(s => s.current === poi.id);
  const { dispatch, setHover } = useStore.getState();
  const [x, y, z] = poi.marker.position;

  useFrame(({ clock }, dt) => {
    g.current.rotation.y += dt * (hovered ? 2.2 : 0.8);
    const s = hovered ? 1.4 : here ? 0.8 : 1;
    m.current.scale.lerp(tmp.set(s, s, s), Math.min(1, dt * 8));
    g.current.position.y = y + Math.sin(clock.elapsedTime * 1.4 + phase) * 0.08;
  });

  return (
    <group ref={g} position={[x, y, z]}>
      <Solid ref={m} shape="octahedron" args={[0.2, 0]} fill="fine" line="glow" />
      <Segs points={circlePts(0.38, 32)} rotation-x={Math.PI / 2} />
      <mesh
        material={mats.fills.hit}
        onPointerOver={e => { e.stopPropagation(); setHover(poi.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { if (useStore.getState().hover === poi.id) setHover(null); document.body.style.cursor = ''; }}
        onClick={e => { e.stopPropagation(); if (e.delta < 8) dispatch({ type: 'goTo', poi: poi.id }); }}
      >
        <sphereGeometry args={[0.65, 8, 8]} />
      </mesh>
    </group>
  );
}

export function Markers() {
  const pois = useStore(s => s.pois);
  const visible = useStore(s => s.markersVisible && !s.zoom);
  if (!visible) return null;
  return pois.map((p, i) => <Marker key={p.id} poi={p} phase={i} />);
}
