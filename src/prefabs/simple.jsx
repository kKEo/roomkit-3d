import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Solid, Segs, shapeArgs } from '../scene/core.jsx';
import { reducedMotion } from '../lib/env.js';

/** Door frame in a wall (origin = wall surface at floor level, facing +Z) with a swing arc on the floor. */
export function Door({ props }) {
  const { width: w, height: h } = props;
  const s = w / 2 - 0.3;
  return (
    <group>
      <Solid hotspot="door" args={[0.25, h, 0.4]} position={[-w / 2, h / 2, 0.2]} />
      <Solid hotspot="door" args={[0.25, h, 0.4]} position={[w / 2, h / 2, 0.2]} />
      <Solid hotspot="door" args={[w + 0.25, 0.25, 0.4]} position={[0, h + 0.12, 0.2]} />
      <Segs points={[-s, 0.02, 0.45, s, 0.02, 0.45, -s, 0.02, 0.45, -s - 0.4, 0.02, 1.6, s, 0.02, 0.45, s + 0.4, 0.02, 1.6]} />
    </group>
  );
}

/** Plain bench / low block (origin = floor centre). */
export function Bench({ props }) {
  const { width, height, depth } = props;
  return <Solid hotspot="bench" args={[width, height, depth]} position={[0, height / 2, 0]} />;
}

/** Any basic shape; raw geometry `args` override the size-derived ones. Optional spin (rad/s) and float (amplitude). */
export function Primitive({ props }) {
  const { shape, args, size, fill, edge, spin, float } = props;
  const geoArgs = Array.isArray(args) ? args : shapeArgs(shape, size ?? 1);
  const ref = useRef();
  useFrame(({ clock }, dt) => {
    if (reducedMotion) return;
    if (spin) ref.current.rotation.y += dt * spin;
    if (float) ref.current.position.y = Math.sin(clock.elapsedTime * 0.9) * float;
  });
  return (
    <group ref={ref}>
      <Solid hotspot="shape" shape={shape} args={geoArgs} fill={fill} line={edge} />
    </group>
  );
}
