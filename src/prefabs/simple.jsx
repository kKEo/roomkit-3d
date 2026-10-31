import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Solid, Segs, shapeArgs, useWorld, ActionsContext } from '../scene/core.jsx';
import { useStore } from '../state/store.js';
import { reducedMotion } from '../lib/env.js';
import { DEG } from '../lib/math.js';

/** Canvas texture of a small sign: `text` in the accent colour on the theme background, framed. */
function makePlate(theme, text) {
  const W = 512, H = 112;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme.accent; ctx.lineWidth = 6; ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = theme.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `48px ${theme.fonts.display}`;
  ctx.fillText(text, W / 2, H / 2 + 2, W - 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A sign with the destination's name, pinned to the door wing. */
function Nameplate({ text, width, ...rest }) {
  const { theme } = useWorld();
  const texture = useMemo(() => makePlate(theme, text), [theme, text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh {...rest}>
      <planeGeometry args={[width, width * 112 / 512]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/**
 * Door in a wall (origin = wall surface at floor level, facing +Z): a plain frame around a clickable
 * door wing, with a swing arc on the floor. The wing swings ajar while its action waits to be
 * confirmed, and carries a nameplate when the action has a `label`.
 */
export function Door({ props }) {
  const { width: w, height: h } = props;
  const actions = useContext(ActionsContext);
  const action = actions.door;
  const pending = useStore(s => s.confirm != null && s.confirm === action);
  const s = w / 2 - 0.3;
  const wingW = w - 0.25, wingH = h - 0.1;
  const wing = useRef();

  useFrame((_, dt) => {
    const target = pending ? -28 * DEG : 0;
    const k = reducedMotion ? 1 : Math.min(1, dt * 3);
    wing.current.rotation.y += (target - wing.current.rotation.y) * k;
  });

  return (
    <group>
      {/* frame — decoration only */}
      <Solid args={[0.25, h, 0.4]} position={[-w / 2, h / 2, 0.2]} />
      <Solid args={[0.25, h, 0.4]} position={[w / 2, h / 2, 0.2]} />
      <Solid args={[w + 0.25, 0.25, 0.4]} position={[0, h + 0.12, 0.2]} />
      {/* door wing, hinged on its left edge — the clickable part */}
      <group ref={wing} position={[-wingW / 2, 0, 0.1]}>
        <Solid hotspot="door" args={[wingW, wingH, 0.08]} position={[wingW / 2, wingH / 2, 0]}>
          <Solid args={[0.08, 0.5, 0.08]} position={[wingW / 2 - 0.3, h * 0.45 - wingH / 2, 0.08]} line="mid" />
          {action?.label && <Nameplate text={action.label} width={wingW * 0.7} position={[0, h * 0.8 - wingH / 2, 0.045]} />}
        </Solid>
      </group>
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
