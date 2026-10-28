import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from './core.jsx';
import { reducedMotion } from '../lib/env.js';

/** Slowly falling dust specks — adds depth and makes parallax readable. */
export function Particles({ count }) {
  const { room, theme } = useWorld();
  const n = reducedMotion ? Math.min(count, 220) : count;
  const { geometry, speed } = useMemo(() => {
    const HX = room.width / 2 - 0.5, HZ = room.depth / 2 - 0.5;
    const pos = new Float32Array(n * 3), speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * HX;
      pos[i * 3 + 1] = Math.random() * room.height;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * HZ;
      speed[i] = 0.15 + Math.random() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geometry, speed };
  }, [n, room]);

  useFrame((_, dt) => {
    if (reducedMotion || !n) return;
    dt = Math.min(dt, 0.05);
    const a = geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      a[i * 3 + 1] -= speed[i] * dt;
      if (a[i * 3 + 1] < 0) a[i * 3 + 1] = room.height;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  if (!n) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial color={theme.accent} size={0.04} transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}
