import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, Segs, shapeArgs, useWorld } from '../scene/core.jsx';
import { circlePts } from '../lib/math.js';
import { reducedMotion } from '../lib/env.js';

/** Plinth with a floating, slowly rotating solid wrapped in orbit rings. */
export function Pedestal({ props }) {
  const { shape, height, size, rings } = props;
  const { mats } = useWorld();
  const core = useRef(), solid = useRef(), inner = useRef(), r1 = useRef(), r2 = useRef();
  const innerGeo = useMemo(() => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(size * 0.52, 1)), [size]);
  const k = size / 1.2;

  useFrame(({ clock }, dt) => {
    if (reducedMotion) return;
    core.current.rotation.y += dt * 0.35;
    solid.current.rotation.x += dt * 0.2;
    inner.current.rotation.y -= dt * 0.8;
    if (r1.current) r1.current.rotation.z += dt * 0.25;
    if (r2.current) r2.current.rotation.y += dt * 0.15;
    core.current.position.y = height + Math.sin(clock.elapsedTime * 0.9) * 0.12;
  });

  const top = height - 1.0;
  return (
    <group>
      <Solid shape="cylinder" args={[2.3, 2.3, 0.15, 24]} position={[0, 0.075, 0]} line="mid" />
      <Solid shape="cylinder" args={[1.3, 1.55, 0.9, 12]} position={[0, 0.6, 0]} />
      <Segs line="faint" points={[-0.9, 1.05, 0, -0.3, top, 0, 0.9, 1.05, 0, 0.3, top, 0, 0, 1.05, -0.9, 0, top, -0.3, 0, 1.05, 0.9, 0, top, 0.3]} />
      <group ref={core} position={[0, height, 0]}>
        <Solid ref={solid} shape={shape} args={shapeArgs(shape, size * 2)} />
        <lineSegments ref={inner} geometry={innerGeo} material={mats.lines.thin} />
        {rings && <Segs ref={r1} points={circlePts(2.0 * k, 72)} rotation-x={1.15} />}
        {rings && <Segs ref={r2} points={circlePts(2.45 * k, 96)} line="faint" rotation-z={0.6} />}
      </group>
    </group>
  );
}
