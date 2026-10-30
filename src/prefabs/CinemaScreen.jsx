import { Solid, Segs } from '../scene/core.jsx';
import { ScreenSurface } from './media.jsx';
import { circlePts } from '../lib/math.js';

/** Big wall screen (origin = wall surface at floor level, facing +Z) with stage and speakers. */
export function CinemaScreen({ props }) {
  const { width: w, height: h, elevation, source, src, stage, speakers, zoom } = props;
  const sx = w / 2 + 1.4;
  return (
    <group>
      <Solid args={[w + 0.5, h + 0.5, 0.22]} position={[0, elevation, 0.11]} fill="fine" />
      <ScreenSurface source={source} src={src} zoom={zoom} id="screen" w={w} h={h} position={[0, elevation, 0.23]} />
      {stage && <Solid args={[w + 2.5, 0.25, 2.6]} position={[0, 0.125, 1.4]} />}
      {speakers && [-sx, sx].map(x => (
        <group key={x}>
          <Solid args={[0.95, 2.5, 0.8]} position={[x, 1.5, 0.9]} />
          <Segs points={circlePts(0.28, 32)} position={[x, 1.9, 1.31]} rotation-x={Math.PI / 2} />
          <Segs points={circlePts(0.18, 32)} position={[x, 1.0, 1.31]} rotation-x={Math.PI / 2} />
        </group>
      ))}
    </group>
  );
}
