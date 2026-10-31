/**
 * A row of business-class recliners: a prefab shipped with the scene rather than compiled into the app.
 * Declared in scene.json as `"prefabs": { "seats": "prefabs/seats.js" }` and placed like any object.
 * Origin = floor at the middle of the row. The seats FACE -Z (their backrests are on the +Z side),
 * so a row placed as is looks at a screen on the north wall, where the viewer also stands.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two
 * exports, so it shares one React and one three.js with the app. See the operator guide,
 * "Scene-shipped prefabs", for the full SDK.
 */

/** Describes the props. Runs in the browser and in Node (the test suite), so no DOM or three.js here. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      count: z.number().int().positive().default(4),
      /** seat-to-seat distance; each seat is about 0.4 narrower, the rest is the console between them */
      pitch: z.number().positive().default(1.7),
      /** a step under the row, for tiered seating; 0 draws none */
      riser: z.number().min(0).default(0),
      /** how far the backrests lean, in degrees */
      recline: z.number().min(0).max(60).default(22),
      /** leg rests folded out in front */
      legRest: z.boolean().default(true),
    }),
    hotspots: ['row'],
    placement: p => ({ focus: [0, p.riser + 0.9, 0], cameraDistance: 6, cameraHeight: p.riser + 2.8, markerOffset: [0, p.riser + 2.3, 0] }),
  };
}

/** Builds the component once the scene renders; `sdk` carries React, R3F hooks and the app's building blocks. */
export function component({ h, Solid, Segs }) {
  return function Seats({ props, hovered }) {
    const { count, pitch, riser, recline, legRest } = props;
    const width = count * pitch, x0 = -width / 2 + pitch / 2;
    const sw = pitch - 0.4;                 // seat width; the gap holds the console
    const y = riser;
    const lean = (recline * Math.PI) / 180;
    const line = hovered ? 'glow' : 'thick';
    const parts = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * pitch;
      parts.push(
        // plinth and the deep cushion
        h(Solid, { key: `p${i}`, args: [sw - 0.1, 0.32, 1.0], position: [x, y + 0.16, 0.05], fill: 'fine', line: 'thin' }),
        h(Solid, { key: `c${i}`, args: [sw, 0.22, 1.05], position: [x, y + 0.43, 0.02], line: 'thin' }),
        // backrest leaning back, with a wing-shaped headrest
        h('group', { key: `b${i}`, position: [x, y + 0.5, 0.5], rotation: [lean, 0, 0] },
          h(Solid, { args: [sw, 1.05, 0.2], position: [0, 0.52, 0], line: 'thin' }),
          h(Solid, { args: [sw * 0.72, 0.3, 0.24], position: [0, 1.18, -0.02], fill: 'fine', line: 'thin' }),
        ),
        // armrests either side, flat-topped with a rounded front edge
        h(Solid, { key: `al${i}`, shape: 'box', args: [0.14, 0.26, 0.95], position: [x - sw / 2 + 0.07, y + 0.67, 0.08], fill: 'fine', line: 'thin' }),
        h(Solid, { key: `ar${i}`, shape: 'box', args: [0.14, 0.26, 0.95], position: [x + sw / 2 - 0.07, y + 0.67, 0.08], fill: 'fine', line: 'thin' }),
        // the leg rest folded out towards the screen
        legRest && h(Solid, { key: `l${i}`, args: [sw - 0.3, 0.14, 0.7], position: [x, y + 0.36, -0.78], rotation: [-0.25, 0, 0], fill: 'fine', line: 'thin' }),
        // the console between seats: a small table with a cup ring
        i < count - 1 && h(Solid, { key: `t${i}`, args: [0.34, 0.68, 0.7], position: [x + pitch / 2, y + 0.34, 0.1], fill: 'fine', line: 'thin' }),
      );
    }
    // stitching lines along the cushions, one run of segments for the whole row
    const stitches = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * pitch;
      for (const dz of [-0.3, 0, 0.3]) stitches.push(x - sw / 2 + 0.1, y + 0.545, dz, x + sw / 2 - 0.1, y + 0.545, dz);
    }
    return h('group', null,
      riser > 0 && h(Solid, { args: [width + 0.6, riser, 2.6], position: [0, riser / 2, -0.1], fill: 'fine', line: 'mid' }),
      h(Solid, { hotspot: 'row', args: [width, 0.05, 2.2], position: [0, y + 0.02, -0.15], fill: false, line }),
      ...parts,
      h(Segs, { line: 'faint', points: stitches }),
    );
  };
}
