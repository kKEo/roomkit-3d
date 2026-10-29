import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Solid, Segs, shapeArgs } from '../scene/core.jsx';
import { ScreenSurface } from './media.jsx';
import { reducedMotion } from '../lib/env.js';

/** Wall-mounted frame (origin = wall surface at the frame centre) with optional image and floating exhibit. */
export function PictureFrame({ props }) {
  const { width: w, height: h, image, exhibit, caption, zoom } = props;
  const ex = useRef();
  const seed = useRef(Math.random() * 6);

  useFrame(({ clock }, dt) => {
    if (reducedMotion || !ex.current) return;
    ex.current.rotation.y += dt * 0.35;
    ex.current.rotation.x = Math.sin(clock.elapsedTime * 0.5 + seed.current) * 0.3;
  });

  const iw = w - 0.4, ih = h - 0.4, z = 0.16;
  return (
    <group>
      <Solid args={[w, h, 0.14]} position={[0, 0, 0.08]} fill="fine" />
      <Segs points={[-iw / 2, -ih / 2, z, iw / 2, -ih / 2, z, -iw / 2, ih / 2, z, iw / 2, ih / 2, z, -iw / 2, -ih / 2, z, -iw / 2, ih / 2, z, iw / 2, -ih / 2, z, iw / 2, ih / 2, z]} />
      {image && <ScreenSurface source="image" src={image} zoom={zoom} w={iw - 0.04} h={ih - 0.04} position={[0, 0, z + 0.005]} />}
      {caption && (
        <Segs points={[-w / 2 + 0.25, -h / 2 - 0.35, 0.03, 0.2, -h / 2 - 0.35, 0.03, -w / 2 + 0.25, -h / 2 - 0.55, 0.03, -0.6, -h / 2 - 0.55, 0.03]} />
      )}
      {exhibit && (
        <group ref={ex} position={[0, 0, 1.3]}>
          {exhibit === 'torusKnot'
            ? <Solid shape="torusKnot" args={shapeArgs('torusKnot', 1.2)} fill={false} line="thin" threshold={25} />
            : <Solid shape={exhibit} args={shapeArgs(exhibit, 1.2)} />}
        </group>
      )}
    </group>
  );
}
