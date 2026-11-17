/**
 * Coffee table: an object type shipped with the scene rather than compiled into the app.
 * Origin = the floor under its middle; it faces +Z; metres.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two exports.
 * After every change:   node tools/scene.js prefab check lounge-pack coffeeTable
 * To see what it makes: node tools/scene.js prefab describe lounge-pack coffeeTable
 */

const TOP = 0.04;   // thickness of the top
const FOOT = 0.03;  // thickness of the foot

/** Describes the props. Runs in the browser and in Node, so no DOM or three.js here. Every prop needs a default. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      diameter: z.number().min(0.4).max(2).default(0.9).describe('metres across the top'),
      height: z.number().min(0.25).max(1.1).default(0.45).describe('metres from the floor to the top surface'),
    }),
    title: 'Coffee table',
    blurb: 'a round top on a central column with a round foot',
    glyph: 'O',
    hotspots: ['top'],
    // the box that holds every solid part, for every prop
    geometry: p => ({ min: [-p.diameter / 2, 0, -p.diameter / 2], max: [p.diameter / 2, p.height, p.diameter / 2], mount: 'floor', round: true }),
    placement: p => ({ focus: [0, p.height * 0.7, 0], cameraDistance: Math.max(3, p.diameter * 1.6 + p.height + 1), cameraHeight: p.height + 1.1, markerOffset: [0, p.height + 0.5, 0] }),
  };
}

/** Builds the component. `sdk` carries React (`h` is createElement), the hooks and the building blocks. */
export function component({ h, Solid }) {
  return function CoffeeTable({ props, hovered }) {
    const { diameter, height } = props;
    const r = diameter / 2;
    const footR = r * 0.55;
    const colH = height - TOP - FOOT;
    return h('group', null,
      h(Solid, { name: 'top', hotspot: 'top', shape: 'cylinder', args: [r, r, TOP, 32], position: [0, height - TOP / 2, 0], line: hovered ? 'glow' : 'thick' }),
      h(Solid, { name: 'column', shape: 'cylinder', args: [0.04, 0.04, colH, 12], position: [0, FOOT + colH / 2, 0], fill: 'fine', line: 'mid' }),
      h(Solid, { name: 'foot', shape: 'cylinder', args: [footR, footR, FOOT, 24], position: [0, FOOT / 2, 0], line: 'mid' }),
    );
  };
}
