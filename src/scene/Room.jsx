import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, Segs, Outline, useWorld } from './core.jsx';
import { edges, gridSegments } from '../lib/footprint.js';

/** The room shell: the footprint polygon extruded from the floor to the ceiling (inner faces are drawn). */
function useShellGeometry(footprint, height) {
  const key = JSON.stringify(footprint);
  const geometry = useMemo(() => {
    // ExtrudeGeometry extrudes along +z; rotating -90° about x maps shape (x, y, e) to world (x, e, -y),
    // so a shape point (x, -z) ends up at world (x, e, z).
    const shape = new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- footprint compared by value through `key`
  }, [key, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Room shell, floor/ceiling grids, wall panelling, pillars and light fixtures — all from scene.room. */
export function Room() {
  const { room, mats } = useWorld();
  const { height: RH, footprint } = room;
  const shell = useShellGeometry(footprint, RH);
  // the ceiling's grid and lamps would cover the view from above (overview), so hide them up there
  const ceilingParts = useRef(null);
  useFrame(({ camera }) => { if (ceilingParts.current) ceilingParts.current.visible = camera.position.y < RH; });

  const { floor, ceiling, walls } = useMemo(() => {
    const w = [], step = room.wallPanels, e = 0.02;
    for (const { a, b, length, dir, normal } of edges(footprint)) {
      const ox = normal[0] * e, oz = normal[1] * e; // inset a little so the lines don't fight the wall
      if (step) {
        for (let s = step; s < length - 1e-6; s += step) {
          const x = a[0] + dir[0] * s + ox, z = a[1] + dir[1] * s + oz;
          w.push(x, 0, z, x, RH, z);
        }
      }
      for (const y of room.skirting) w.push(a[0] + ox, y, a[1] + oz, b[0] + ox, y, b[1] + oz);
    }
    return { floor: gridSegments(footprint, room.grid.floor, 0.01), ceiling: gridSegments(footprint, room.grid.ceiling, RH - 0.01), walls: w };
  }, [room, footprint, RH]);

  return (
    <group>
      <mesh geometry={shell} material={mats.fills.room}>
        <Outline geometry={shell} line="thick" />
      </mesh>
      {floor.length > 0 && <Segs points={floor} line="faint" />}
      <group ref={ceilingParts}>
        {ceiling.length > 0 && <Segs points={ceiling} line="faint" />}
        {room.lights.map(([x, y, z], i) =>
          y >= RH - 0.8 ? (
            // flush ceiling panel
            <Solid key={i} args={[2.2, 0.14, 2.2]} position={[x, RH - 0.07, z]} line="mid" fill="fine" />
          ) : (
            // pendant bar on two wires
            <group key={i}>
              <Segs points={[x - 0.5, RH, z, x - 0.5, y + 0.1, z, x + 0.5, RH, z, x + 0.5, y + 0.1, z]} />
              <Solid args={[1.4, 0.16, 0.45]} position={[x, y, z]} line="mid" fill="fine" />
            </group>
          ),
        )}
      </group>
      {walls.length > 0 && <Segs points={walls} line="faint" />}

      {room.pillars.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Solid shape="cylinder" args={[0.55, 0.55, RH, 8]} position={[0, RH / 2, 0]} line="mid" />
          <Solid args={[1.5, 0.4, 1.5]} position={[0, 0.2, 0]} />
          <Solid args={[1.5, 0.3, 1.5]} position={[0, RH - 0.15, 0]} />
        </group>
      ))}
    </group>
  );
}
