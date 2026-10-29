import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Solid, Segs, useGeometry, Outline, useWorld } from './core.jsx';

/** Room shell, floor/ceiling grids, wall panelling, pillars and light fixtures — all from scene.room. */
export function Room() {
  const { room, mats } = useWorld();
  const { width: RW, height: RH, depth: RD } = room;
  const HX = RW / 2, HZ = RD / 2;
  const shell = useGeometry('box', [RW, RH, RD]);
  // the ceiling's grid and lamps would cover the view from above (overview), so hide them up there
  const ceilingParts = useRef(null);
  useFrame(({ camera }) => { if (ceilingParts.current) ceilingParts.current.visible = camera.position.y < RH; });

  const { floor, ceiling, walls } = useMemo(() => {
    const grid = (step, y) => {
      const a = [];
      if (!step) return a;
      for (let v = -HX; v <= HX + 1e-6; v += step) a.push(v, y, -HZ, v, y, HZ);
      for (let v = -HZ; v <= HZ + 1e-6; v += step) a.push(-HX, y, v, HX, y, v);
      return a;
    };
    const w = [], step = room.wallPanels, e = 0.02;
    if (step) {
      for (let v = -HZ + step; v < HZ - 1e-6; v += step) w.push(-HX + e, 0, v, -HX + e, RH, v, HX - e, 0, v, HX - e, RH, v);
      for (let v = -HX + step; v < HX - 1e-6; v += step) w.push(v, 0, -HZ + e, v, RH, -HZ + e, v, 0, HZ - e, v, RH, HZ - e);
    }
    room.skirting.forEach(y => {
      w.push(-HX + e, y, -HZ, -HX + e, y, HZ, HX - e, y, -HZ, HX - e, y, HZ, -HX, y, -HZ + e, HX, y, -HZ + e, -HX, y, HZ - e, HX, y, HZ - e);
    });
    return { floor: grid(room.grid.floor, 0.01), ceiling: grid(room.grid.ceiling, RH - 0.01), walls: w };
  }, [room, HX, HZ, RH]);

  return (
    <group>
      <mesh geometry={shell} material={mats.fills.room} position={[0, RH / 2, 0]}>
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
