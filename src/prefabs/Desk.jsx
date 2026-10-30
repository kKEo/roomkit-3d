import { Solid, Segs } from '../scene/core.jsx';
import { ScreenSurface } from './media.jsx';

/** Swivel chair (origin = floor under the seat); the sitter faces -Z. */
export function Chair({ hotspot, ...props }) {
  return (
    <group {...props}>
      <Solid hotspot={hotspot} args={[0.7, 0.08, 0.7]} position={[0, 0.6, 0]} />
      <Solid hotspot={hotspot} args={[0.7, 0.6, 0.08]} position={[0, 0.95, 0.35]} />
      <Solid shape="cylinder" args={[0.04, 0.04, 0.55, 6]} position={[0, 0.3, 0]} line="mid" />
      <Segs points={[-0.35, 0.02, 0, 0.35, 0.02, 0, 0, 0.02, -0.35, 0, 0.02, 0.35]} />
    </group>
  );
}

/**
 * Desk with monitor, keyboard and chair (origin = floor centre; the seated user faces -Z, viewers stand at +Z).
 * `screen` is a full screen config (the loader turns a bare source name into one); the desk-level
 * `src` and `zoom` props are the older spelling and apply when the screen config does not set them.
 */
export function Desk({ props }) {
  const { screen, src, chair, zoom } = props;
  return (
    <group>
      <Solid args={[2.6, 0.08, 1.2]} position={[0, 1.05, 0]} />
      {[[-1.22, -0.52], [1.22, -0.52], [-1.22, 0.52], [1.22, 0.52]].map(([x, z]) => (
        <Solid key={`${x}${z}`} args={[0.06, 1.0, 0.06]} position={[x, 0.5, z]} line="mid" />
      ))}
      <Solid args={[1.34, 0.82, 0.07]} position={[0, 1.78, -0.3]} />
      <ScreenSurface {...screen} src={screen.src ?? src} zoom={zoom && screen.zoom} id={screen.id ?? 'screen'} w={1.2} h={0.68} position={[0, 1.78, -0.263]} />
      <Solid args={[0.08, 0.36, 0.08]} position={[0, 1.27, -0.3]} line="mid" />
      <Solid args={[0.85, 0.03, 0.26]} position={[0, 1.105, 0.12]} line="mid" fill="fine" />
      {chair && <Chair hotspot="chair" position={[0, 0, 0.95]} />}
    </group>
  );
}
