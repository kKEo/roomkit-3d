import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, Segs, polylineToSegs, useWorld } from '../scene/core.jsx';
import { DEG } from '../lib/math.js';
import { reducedMotion } from '../lib/env.js';

const V3 = THREE.Vector3;

/**
 * Row of server cabinets (origin = floor centre of the row, fronts face +Z) with blinking LEDs and cables,
 * behind a four-panel bi-fold door: two panels per side, hinged at the outer edges, that fold back on
 * themselves from the centre while its POI is in focus (like the wardrobe's doors), and close again after.
 */
export function ServerRack({ props, active }) {
  const { count, height: H, cables, openOnFocus, openAngle } = props;
  const { room } = useWorld();
  const ceiling = props.ceiling ?? room.height;
  const xs = useMemo(() => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 1.1), [count]);
  const front = 0.81;
  const ledRef = useRef(), acc = useRef(0);
  const leftOuter = useRef(), leftInner = useRef(), rightOuter = useRef(), rightInner = useRef();

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
    // doors: the outer panel swings out by `a`; the inner one folds back twice as far, so its free edge slides along the track
    const target = openOnFocus && active ? openAngle * DEG : 0;
    const k = reducedMotion ? 1 : Math.min(1, dt * 2.5);
    const a = leftOuter.current.rotation.y + (-target - leftOuter.current.rotation.y) * k;
    leftOuter.current.rotation.y = a; leftInner.current.rotation.y = -2 * a;
    rightOuter.current.rotation.y = -a; rightInner.current.rotation.y = 2 * a;

    acc.current += dt;
    if (reducedMotion || acc.current < 0.12) return;
    acc.current = 0;
    const c = ledGeo.attributes.color.array;
    for (let i = 0; i < c.length; i += 3) {
      if (Math.random() < 0.15) { const on = Math.random() > 0.35; c[i] = on ? 0.6 : 0; c[i + 1] = on ? 1 : 0.12; c[i + 2] = on ? 0.7 : 0.05; }
    }
    ledGeo.attributes.color.needsUpdate = true;
  });

  // the enclosure: a frame around the row's front, with the door track just in front of the LEDs
  const W = count * 1.1 + 0.1, track = 0.92;
  const quarter = W / 4, pw = quarter - 0.01, doorH = H - 0.15, doorY = 0.1 + doorH / 2;
  // a panel hanging from its hinge at x = 0 towards `side` (+1 right, -1 left), and the handle near its free edge
  const panel = side => <Solid hotspot="doors" args={[pw, doorH, 0.05]} position={[(side * pw) / 2, doorY, 0]} />;
  const handle = side => <Solid args={[0.05, 0.5, 0.06]} position={[side * (pw - 0.12), H * 0.5, 0.055]} line="mid" />;

  return (
    <group>
      {xs.map(x => <Solid key={x} hotspot="rack" args={[1.05, H, 1.6]} position={[x, H / 2, 0]} />)}
      <Segs points={slots} />
      <points ref={ledRef} geometry={ledGeo}>
        <pointsMaterial size={0.055} vertexColors sizeAttenuation />
      </points>
      {cables && <Solid args={[count * 1.2, 0.14, 1.0]} position={[0, H + 0.4, 0]} line="mid" fill="fine" />}
      {cables && cableSegs.map((s, i) => <Segs key={i} points={s} />)}
      {/* door frame: posts and the top rail the panels hang from */}
      <Solid args={[0.06, H, 0.14]} position={[-W / 2 - 0.03, H / 2, track - 0.02]} line="mid" />
      <Solid args={[0.06, H, 0.14]} position={[W / 2 + 0.03, H / 2, track - 0.02]} line="mid" />
      <Solid args={[W + 0.12, 0.1, 0.16]} position={[0, H + 0.05, track - 0.02]} line="mid" />
      {/* left pair: outer panel hinged on the frame, inner panel hinged on the outer one's free edge */}
      <group ref={leftOuter} position={[-W / 2, 0, track]}>
        {panel(1)}
        <group ref={leftInner} position={[quarter, 0, 0]}>
          {panel(1)}
          {handle(1)}
        </group>
      </group>
      {/* right pair: the same, hung from the right post towards the centre (no mirror scale: that turns faces inside out) */}
      <group ref={rightOuter} position={[W / 2, 0, track]}>
        {panel(-1)}
        <group ref={rightInner} position={[-quarter, 0, 0]}>
          {panel(-1)}
          {handle(-1)}
        </group>
      </group>
    </group>
  );
}
