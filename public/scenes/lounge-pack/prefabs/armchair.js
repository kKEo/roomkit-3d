/**
 * Armchair: an object type shipped with the scene rather than compiled into the app.
 * Origin = the floor under its middle; it faces +Z; metres.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two exports.
 * After every change:   node tools/scene.js prefab check lounge-pack armchair
 * To see what it makes: node tools/scene.js prefab describe lounge-pack armchair
 */

const DEPTH = 0.85;   // front to back
const ARM = 0.14;     // armrest thickness
const BACK = 0.16;    // backrest thickness
const LEG = 0.15;     // leg height
const SEAT_TOP = 0.45;
const ARM_TOP = 0.62;
const BACK_TOP = 0.9;

/** Describes the props. Runs in the browser and in Node, so no DOM or three.js here. Every prop needs a default. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      width: z.number().min(0.6).max(2.4).default(0.9).describe('metres across, armrests included'),
    }),
    title: 'Armchair',
    blurb: 'a low armchair on four short legs',
    glyph: 'A',
    hotspots: [],
    // the box that holds every solid part, for every prop
    geometry: p => ({ min: [-p.width / 2, 0, -DEPTH / 2], max: [p.width / 2, BACK_TOP, DEPTH / 2], mount: 'floor' }),
    placement: p => ({ focus: [0, 0.45, 0], cameraDistance: Math.max(3, p.width * 1.6 + 1.5), cameraHeight: 1.4, markerOffset: [0, BACK_TOP + 0.5, 0] }),
  };
}

/** Builds the component. `sdk` carries React (`h` is createElement), the hooks and the building blocks. */
export function component({ h, Solid }) {
  return function Armchair({ props, hovered }) {
    const { width } = props;
    const inner = width - 2 * ARM;
    const line = hovered ? 'glow' : 'thick';
    const armX = width / 2 - ARM / 2;
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    return h('group', null,
      h(Solid, { name: 'seat', args: [inner, SEAT_TOP - LEG, DEPTH - BACK], position: [0, (SEAT_TOP + LEG) / 2, BACK / 2], line }),
      h(Solid, { name: 'backrest', args: [inner, BACK_TOP - LEG, BACK], position: [0, (BACK_TOP + LEG) / 2, -DEPTH / 2 + BACK / 2], line }),
      h(Solid, { name: 'left armrest', args: [ARM, ARM_TOP - LEG, DEPTH], position: [-armX, (ARM_TOP + LEG) / 2, 0], line }),
      h(Solid, { name: 'right armrest', args: [ARM, ARM_TOP - LEG, DEPTH], position: [armX, (ARM_TOP + LEG) / 2, 0], line }),
      ...legs.map(([sx, sz], i) => h(Solid, { key: i, name: `leg ${i + 1}`, args: [0.07, LEG, 0.07], position: [sx * (width / 2 - 0.07), LEG / 2, sz * (DEPTH / 2 - 0.07)], fill: 'fine', line: 'mid' })),
    );
  };
}
