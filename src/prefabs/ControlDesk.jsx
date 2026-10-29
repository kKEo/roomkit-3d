import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, useWorld } from '../scene/core.jsx';
import { ScreenSurface } from './media.jsx';
import { Chair } from './Desk.jsx';
import { DEG } from '../lib/math.js';
import { reducedMotion } from '../lib/env.js';

const SCREEN_BASE = 1.65; // bottom edge of the lowest screen row
const GAP = 0.1;

/** Point on the arc of radius r centred at local (0, 0, R), angle θ from its middle; faces the centre. */
function onArc(R, r, theta, y = 0) {
  return { position: [r * Math.sin(theta), y, R - r * Math.cos(theta)], rotation: [0, -theta, 0] };
}

/** Grid of console buttons on a sloped panel, blinking in the theme accent. */
function ConsoleLeds({ width }) {
  const { theme } = useWorld();
  const acc = useRef(0);
  const { geometry, on, off } = useMemo(() => {
    const pos = [], col = [];
    const cols = Math.max(4, Math.floor(width / 0.12));
    for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) {
      pos.push(-width * 0.42 + (c * width * 0.84) / (cols - 1), 0.03, -0.12 + r * 0.09);
      col.push(0, 0, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const on = new THREE.Color(theme.accent), off = on.clone().multiplyScalar(0.18);
    const a = geometry.attributes.color.array;
    for (let i = 0; i < a.length; i += 3) (Math.random() > 0.4 ? on : off).toArray(a, i);
    return { geometry, on, off };
  }, [width, theme.accent]);

  useFrame((_, dt) => {
    acc.current += dt;
    if (reducedMotion || acc.current < 0.15) return;
    acc.current = 0;
    const a = geometry.attributes.color.array;
    for (let i = 0; i < a.length; i += 3) if (Math.random() < 0.08) (Math.random() > 0.4 ? on : off).toArray(a, i);
    geometry.attributes.color.needsUpdate = true;
  });

  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.045} vertexColors sizeAttenuation />
    </points>
  );
}

/** One desk segment (local +Z towards the operators): body, top, sloped console, keyboard and knobs. */
function Segment({ width }) {
  return (
    <group>
      <Solid args={[width, 0.92, 0.7]} position={[0, 0.46, -0.15]} />
      <Solid args={[width, 0.08, 1.1]} position={[0, 0.96, 0]} line="thick" />
      <group position={[0, 1.13, -0.3]} rotation={[0.45, 0, 0]}>
        <Solid args={[width * 0.92, 0.05, 0.42]} fill="fine" line="mid" />
        <ConsoleLeds width={width * 0.92} />
        {[-0.3, 0, 0.3].map(x => (
          <Solid key={x} shape="cylinder" args={[0.035, 0.035, 0.06, 8]} position={[x * width, 0.05, 0.13]} line="thin" />
        ))}
      </group>
      <Solid args={[Math.min(0.8, width * 0.55), 0.03, 0.22]} position={[0, 1.015, 0.28]} fill="fine" line="mid" />
    </group>
  );
}

/**
 * Curved control-centre console (origin = floor at the middle of the desk; operators sit on the
 * +Z side). A wall of screens stands behind it; every entry of `screens` configures one screen,
 * filled left to right, top row first.
 */
export function ControlDesk({ props }) {
  const { radius: R, arc, segments, columns, screenWidth: sw, screenHeight: sh, chairs } = props;
  const screens = Array.isArray(props.screens) ? props.screens : [];
  const cols = Math.max(1, columns | 0);
  const rows = Math.max(1, Math.ceil(screens.length / cols));
  const top = SCREEN_BASE + rows * (sh + GAP);

  const segAngle = (arc * DEG) / Math.max(1, segments);
  const segWidth = 2 * R * Math.sin(segAngle / 2) + 0.02;
  const Rs = R + 0.85; // screen wall radius
  const colAngle = 2 * Math.asin(Math.min(1, (sw + GAP) / 2 / Rs));
  const chairAngle = (arc * DEG * 0.6) / Math.max(1, chairs);

  return (
    <group>
      {Array.from({ length: segments }, (_, i) => (
        <group key={`seg${i}`} {...onArc(R, R, (i - (segments - 1) / 2) * segAngle)}>
          <Segment width={segWidth} />
        </group>
      ))}

      {Array.from({ length: cols }, (_, c) => (
        <group key={`post${c}`} {...onArc(R, Rs + 0.1, (c - (cols - 1) / 2) * colAngle)}>
          <Solid shape="cylinder" args={[0.045, 0.045, top, 6]} position={[0, top / 2, 0]} line="mid" />
        </group>
      ))}

      {screens.map((screen, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        const y = SCREEN_BASE + (rows - 1 - r) * (sh + GAP) + sh / 2;
        return (
          <group key={`scr${k}`} {...onArc(R, Rs, (c - (cols - 1) / 2) * colAngle, y)}>
            <Solid args={[sw + 0.08, sh + 0.08, 0.06]} fill="fine" line="mid" />
            <ScreenSurface {...screen} id={`scr${k}`} w={sw} h={sh} position={[0, 0, 0.035]} />
          </group>
        );
      })}

      {Array.from({ length: chairs }, (_, i) => (
        <group key={`chair${i}`} {...onArc(R, R - 1.15, (i - (chairs - 1) / 2) * chairAngle)}>
          <Chair />
        </group>
      ))}
    </group>
  );
}
