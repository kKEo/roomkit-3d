import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, Segs, polylineToSegs, useWorld } from '../scene/core.jsx';
import { reducedMotion } from '../lib/env.js';

const V3 = THREE.Vector3;

/** Row of server cabinets (origin = floor centre of the row, fronts face +Z) with blinking LEDs and cables. */
export function ServerRack({ props }) {
  const { count, height: H, cables } = props;
  const { room } = useWorld();
  const ceiling = props.ceiling ?? room.height;
  const xs = useMemo(() => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 1.1), [count]);
  const front = 0.81;
  const ledRef = useRef(), acc = useRef(0);

  const { slots, ledGeo, cableSegs } = useMemo(() => {
    const slots = [], pos = [], col = [];
    xs.forEach(x => {
      for (let y = 0.5; y < H - 0.3; y += 0.32) slots.push(x - 0.42, y, front, x + 0.42, y, front);
      slots.push(x - 0.45, 0.3, front, x - 0.45, H - 0.2, front);
      for (let y = 0.62; y < H - 0.3; y += 0.32) for (let k = 0; k < 3; k++) { pos.push(x + 0.12 + k * 0.09, y, front + 0.02); col.push(0, 1, 0.4); }
    });
    const ledGeo = new THREE.BufferGeometry();
    ledGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ledGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const span = (count * 1.1) / 2;
    const cableSegs = xs.map((_, i) => {
      const x = -span + 0.35 + (i * (2 * span - 0.7)) / Math.max(1, count - 1);
      const c = new THREE.CatmullRomCurve3([new V3(x, H + 0.45, 0), new V3(x * 1.3, H + 1.4, 0.5), new V3(x * 1.6, ceiling, 1.3 - i * 0.3)]);
      return polylineToSegs(c.getPoints(24));
    });
    return { slots, ledGeo, cableSegs };
  }, [xs, H, count, ceiling]);

  useFrame((_, dt) => {
    acc.current += dt;
    if (reducedMotion || acc.current < 0.12) return;
    acc.current = 0;
    const c = ledGeo.attributes.color.array;
    for (let i = 0; i < c.length; i += 3) {
      if (Math.random() < 0.15) { const on = Math.random() > 0.35; c[i] = on ? 0.6 : 0; c[i + 1] = on ? 1 : 0.12; c[i + 2] = on ? 0.7 : 0.05; }
    }
    ledGeo.attributes.color.needsUpdate = true;
  });

  return (
    <group>
      {xs.map(x => <Solid key={x} hotspot="rack" args={[1.05, H, 1.6]} position={[x, H / 2, 0]} />)}
      <Segs points={slots} />
      <points ref={ledRef} geometry={ledGeo}>
        <pointsMaterial size={0.055} vertexColors sizeAttenuation />
      </points>
      {cables && <Solid args={[count * 1.2, 0.14, 1.0]} position={[0, H + 0.4, 0]} line="mid" fill="fine" />}
      {cables && cableSegs.map((s, i) => <Segs key={i} points={s} />)}
    </group>
  );
}
