/**
 * A ceiling projector with a light cone to the screen: a prefab shipped with the scene.
 * Origin = the ceiling mount; the body hangs `drop` below it and throws its beam towards -Z,
 * so with the screen on the north wall it is placed as is, `throw` metres in front of it.
 * The beam is drawn as the four edges of the frustum to a `width` × `height` picture, whose
 * centre is `elevation` above the floor, and a reel on the side turns while the scene runs.
 */

/** Describes the props. Runs in the browser and in Node (the test suite), so no DOM or three.js here. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      /** distance from the lens to the screen */
      throw: z.number().positive().default(20),
      width: z.number().positive().default(10),
      height: z.number().positive().default(5.6),
      /** how far the body hangs below the mount */
      drop: z.number().positive().default(1.2),
      /** the picture's centre height above the floor, measured from this object's position.y */
      elevation: z.number().default(-3.5),
      beam: z.boolean().default(true),
      spin: z.number().min(0).default(0.8),
    }),
    hotspots: ['lens'],
    placement: p => ({ focus: [0, -p.drop, 0], cameraDistance: 7, cameraHeight: -p.drop + 0.5, markerOffset: [0, -p.drop - 1.4, 0] }),
  };
}

/** Builds the component once the scene renders; `sdk` carries React, R3F hooks and the app's building blocks. */
export function component({ h, useRef, useFrame, Solid, Segs, circlePts, reducedMotion }) {
  return function Projector({ props, active, hovered }) {
    const { throw: dist, width, height, drop, elevation, beam, spin } = props;
    const reel = useRef();
    useFrame((_, dt) => {
      if (reducedMotion || !reel.current) return;
      reel.current.rotation.z -= dt * spin * (active ? 3 : 1);
    });
    const y = -drop;                      // body centre, below the mount
    const lens = [0, y, -0.9];
    const dy = elevation - y;             // picture centre relative to the body
    const corners = [[-width / 2, dy + height / 2], [width / 2, dy + height / 2], [width / 2, dy - height / 2], [-width / 2, dy - height / 2]];
    const edges = [];
    for (const [cx, cy] of corners) edges.push(lens[0], lens[1], lens[2], cx, y + cy, -dist);
    // the picture's outline at the screen, closing the frustum
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      edges.push(a[0], y + a[1], -dist, b[0], y + b[1], -dist);
    }
    return h('group', null,
      // mount and two wires
      h(Solid, { shape: 'cylinder', args: [0.35, 0.35, 0.08, 16], position: [0, -0.04, 0], fill: 'fine', line: 'thin' }),
      h(Segs, { line: 'thin', points: [-0.45, 0, 0, -0.45, y + 0.35, 0, 0.45, 0, 0, 0.45, y + 0.35, 0] }),
      // body, lens barrel and the reel
      h(Solid, { args: [1.3, 0.7, 1.7], position: [0, y, 0] }),
      h(Solid, { hotspot: 'lens', shape: 'cylinder', args: [0.22, 0.26, 0.5, 16], position: [0, y, -1.05], rotation: [Math.PI / 2, 0, 0], fill: 'fine', line: hovered ? 'glow' : 'mid' }),
      h('group', { ref: reel, position: [0.75, y + 0.15, 0.3], rotation: [0, Math.PI / 2, 0] },
        h(Segs, { line: 'mid', points: circlePts(0.42, 24), rotation: [Math.PI / 2, 0, 0] }),
        h(Segs, { line: 'faint', points: [-0.42, 0, 0, 0.42, 0, 0, 0, -0.42, 0, 0, 0.42, 0, -0.3, -0.3, 0, 0.3, 0.3, 0, -0.3, 0.3, 0, 0.3, -0.3, 0] }),
      ),
      beam && h(Segs, { line: active || hovered ? 'glow' : 'faint', points: edges }),
    );
  };
}
