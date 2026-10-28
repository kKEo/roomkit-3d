import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Solid, Segs } from '../scene/core.jsx';
import { DEG } from '../lib/math.js';
import { reducedMotion } from '../lib/env.js';

/** Two-door wardrobe (origin = floor centre, doors face +Z). Doors swing open while its POI is in focus. */
export function Wardrobe({ props, active }) {
  const { width: W, height: H, depth: D, openOnFocus, openAngle } = props;
  const left = useRef(), right = useRef();
  const t = 0.06, inner = W - 2 * t;

  useFrame((_, dt) => {
    const target = openOnFocus && active ? openAngle * DEG : 0;
    const k = reducedMotion ? 1 : Math.min(1, dt * 2.5);
    left.current.rotation.y += (-target - left.current.rotation.y) * k;
    right.current.rotation.y += (target - right.current.rotation.y) * k;
  });

  const rodY = H - 0.55;
  const garments = [-0.75, -0.45, -0.2, 0.15, 0.4].map(x => x * inner);
  const hangers = garments.flatMap(x => [x, rodY, 0, x - 0.3, rodY - 0.25, 0, x, rodY, 0, x + 0.3, rodY - 0.25, 0]);
  const doorH = H - 0.25, doorW = W / 2 - 0.01;

  return (
    <group>
      {/* carcass */}
      <Solid args={[W - 0.1, 0.15, D - 0.1]} position={[0, 0.075, 0]} line="mid" />
      <Solid args={[W, t, D]} position={[0, 0.15 + t / 2, 0]} line="mid" />
      <Solid args={[W, t, D]} position={[0, H - t / 2, 0]} />
      <Solid args={[t, H - 0.15, D]} position={[-W / 2 + t / 2, 0.075 + H / 2, 0]} />
      <Solid args={[t, H - 0.15, D]} position={[W / 2 - t / 2, 0.075 + H / 2, 0]} />
      <Solid args={[inner, H - 0.15, t]} position={[0, 0.075 + H / 2, -D / 2 + t / 2]} fill="fine" line="mid" />
      {/* interior: shelf, boxes, rod, hangers, garments */}
      <Solid args={[inner, 0.04, D - 0.12]} position={[0, 1.05, 0]} fill="fine" line="mid" />
      <Solid args={[0.6, 0.45, 0.5]} position={[-inner / 4, 1.3, 0]} line="mid" />
      <Solid args={[0.45, 0.3, 0.45]} position={[inner / 5, 1.22, 0.05]} line="mid" />
      <Segs points={[-inner / 2, rodY, 0, inner / 2, rodY, 0]} line="mid" />
      <Segs points={hangers} />
      {garments.map((x, i) => (
        <Solid key={i} args={[0.08, 1.5 - (i % 2) * 0.35, D * 0.65]} position={[x, rodY - 0.25 - (1.5 - (i % 2) * 0.35) / 2, 0]} fill="fine" line="thin" />
      ))}
      {/* doors, hinged on the outer edges */}
      <group ref={left} position={[-W / 2, 0, D / 2]}>
        <Solid args={[doorW, doorH, 0.05]} position={[doorW / 2, 0.2 + doorH / 2, 0.025]} />
        <Solid args={[0.05, 0.5, 0.06]} position={[doorW - 0.15, H * 0.55, 0.08]} line="mid" />
      </group>
      <group ref={right} position={[W / 2, 0, D / 2]}>
        <Solid args={[doorW, doorH, 0.05]} position={[-doorW / 2, 0.2 + doorH / 2, 0.025]} />
        <Solid args={[0.05, 0.5, 0.06]} position={[-doorW + 0.15, H * 0.55, 0.08]} line="mid" />
      </group>
    </group>
  );
}
