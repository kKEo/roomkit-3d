/**
 * A row of cinema seats: a prefab shipped with the scene rather than compiled into the app.
 * Declared in scene.json as `"prefabs": { "seats": "prefabs/seats.js" }` and placed like any object.
 * Origin = floor at the middle of the row; the seats face +Z (towards the viewer), so a row that
 * looks at a screen on the north wall is placed as is.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two
 * exports, so it shares one React and one three.js with the app. See the operator guide,
 * "Scene-shipped prefabs", for the full SDK.
 */

/** Describes the props. Runs in the browser and in Node (the test suite), so no DOM or three.js here. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      count: z.number().int().positive().default(6),
      /** seat-to-seat distance */
      pitch: z.number().positive().default(1.1),
      /** a step under the row, for tiered seating; 0 draws none */
      riser: z.number().min(0).default(0),
    }),
    hotspots: ['row'],
    placement: p => ({ focus: [0, p.riser + 0.8, 0], cameraDistance: 6, cameraHeight: p.riser + 2.6, markerOffset: [0, p.riser + 2.2, 0] }),
  };
}

/** Builds the component once the scene renders; `sdk` carries React, R3F hooks and the app's building blocks. */
export function component({ h, Solid, Segs }) {
  return function Seats({ props, hovered }) {
    const { count, pitch, riser } = props;
    const width = count * pitch;
    const x0 = -width / 2 + pitch / 2;
    const line = hovered ? 'glow' : 'thick';
    const seats = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * pitch;
      seats.push(
        // cushion and backrest, outline only on the cushion so rows stay light to draw
        h(Solid, { key: `c${i}`, args: [pitch - 0.14, 0.26, 0.9], position: [x, riser + 0.52, 0.1], fill: 'fine', line: 'thin' }),
        h(Solid, { key: `b${i}`, args: [pitch - 0.14, 0.95, 0.16], position: [x, riser + 1.05, -0.4], line: 'thin' }),
      );
    }
    // armrests between seats as a run of segments: cheaper than a Solid each
    const arms = [];
    for (let i = 0; i <= count; i++) {
      const x = x0 - pitch / 2 + i * pitch;
      arms.push(x, riser + 0.65, -0.45, x, riser + 0.65, 0.5, x, riser + 0.65, 0.5, x, riser + 0.0, 0.5);
    }
    return h('group', null,
      riser > 0 && h(Solid, { args: [width + 0.4, riser, 1.9], position: [0, riser / 2, -0.1], fill: 'fine', line: 'mid' }),
      h(Solid, { hotspot: 'row', args: [width, 0.2, 1.3], position: [0, riser + 0.3, -0.05], fill: false, line }),
      ...seats,
      h(Segs, { line: 'faint', points: arms }),
    );
  };
}
