/**
 * Wall clock: an object type shipped with the scene rather than compiled into the app.
 * Origin = the wall surface behind its middle; it faces +Z; metres.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two exports.
 * After every change:   node tools/scene.js prefab check lounge-pack wallClock
 * To see what it makes: node tools/scene.js prefab describe lounge-pack wallClock
 */

const FACE = 0.04;   // how far the face stands off the wall
const HAND = 0.012;  // thickness of a hand
const DEPTH = 0.08;  // face, two hands and the hub
const TURN = Math.PI * 2 / 60; // radians per second: the minute hand goes round once a minute

/** Describes the props. Runs in the browser and in Node, so no DOM or three.js here. Every prop needs a default. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      diameter: z.number().min(0.2).max(3).default(0.6).describe('metres across the face'),
    }),
    title: 'Wall clock',
    blurb: 'a round clock face on the wall whose minute hand turns slowly',
    glyph: '◷',
    hotspots: [],
    // the hands turn inside the face, so the face's square holds them at every angle
    geometry: p => ({ min: [-p.diameter / 2, -p.diameter / 2, 0], max: [p.diameter / 2, p.diameter / 2, DEPTH], mount: 'wall' }),
    placement: p => ({ focus: [0, 0, 0], cameraDistance: Math.max(2.5, p.diameter * 3 + 1), cameraHeight: null, markerOffset: [0, p.diameter / 2 + 0.4, 0.3] }),
  };
}

/** Builds the component. `sdk` carries React (`h` is createElement), the hooks and the building blocks. */
export function component({ h, useRef, useFrame, Solid, Segs, reducedMotion }) {
  return function WallClock({ props, hovered }) {
    const { diameter } = props;
    const r = diameter / 2;
    const minute = useRef();
    useFrame((_, dt) => {
      if (reducedMotion || !minute.current) return;
      minute.current.rotation.z -= dt * TURN; // clockwise seen from the front
    });
    const hourLen = r * 0.5, minLen = r * 0.8, w = Math.max(0.012, r * 0.06);
    const zHour = FACE + HAND / 2, zMin = FACE + HAND * 1.5;
    // twelve hour marks, as lines just in front of the face
    const marks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = r * (i % 3 === 0 ? 0.76 : 0.85), r1 = r * 0.93;
      marks.push(Math.sin(a) * r0, Math.cos(a) * r0, FACE + 0.002, Math.sin(a) * r1, Math.cos(a) * r1, FACE + 0.002);
    }
    return h('group', null,
      h(Solid, { name: 'face', shape: 'cylinder', args: [r, r, FACE, 32], rotation: [Math.PI / 2, 0, 0], position: [0, 0, FACE / 2], fill: false, line: hovered ? 'glow' : 'thick' }),
      h(Segs, { name: 'hour marks', points: marks, line: 'mid' }),
      // the hour hand points at ten o'clock
      h('group', { rotation: [0, 0, Math.PI / 3] },
        h(Solid, { name: 'hour hand', args: [w * 1.4, hourLen, HAND], position: [0, hourLen / 2, zHour], fill: 'fine', line: 'thick' })),
      // the minute hand starts at two o'clock and turns
      h('group', { ref: minute, rotation: [0, 0, -Math.PI / 3] },
        h(Solid, { name: 'minute hand', args: [w, minLen, HAND], position: [0, minLen / 2, zMin], fill: 'fine', line: 'thick' })),
      h(Solid, { name: 'hub', shape: 'cylinder', args: [w, w, DEPTH - FACE, 12], rotation: [Math.PI / 2, 0, 0], position: [0, 0, FACE + (DEPTH - FACE) / 2], line: 'mid' }),
    );
  };
}
