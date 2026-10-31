/**
 * A floor lamp: a prefab shipped with the scene rather than compiled into the app.
 * Declared in scene.json as `"prefabs": { "lamp": "prefabs/lamp.js" }` and placed like any object.
 *
 * A scene prefab is a plain ES module with NO imports: everything it needs is handed to its two
 * exports, so it shares one React and one three.js with the app. See the operator guide,
 * "Scene-shipped prefabs", for the full SDK.
 */

/** Describes the props. Runs in the browser and in Node (the test suite), so no DOM or three.js here. */
export function meta({ z }) {
  return {
    schema: z.strictObject({
      height: z.number().positive().default(1.8),
      lit: z.boolean().default(true),
      spin: z.number().min(0).default(0.3),
    }),
    hotspots: ['shade'],
    placement: p => ({ focus: [0, p.height * 0.7, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
  };
}

/** Builds the component once the scene renders; `sdk` carries React, R3F hooks and the app's building blocks. */
export function component({ h, useRef, useFrame, Solid, Segs, reducedMotion }) {
  return function Lamp({ props, active, hovered }) {
    const { height, lit, spin } = props;
    const shade = useRef();
    useFrame((_, dt) => {
      if (reducedMotion || !shade.current) return;
      shade.current.rotation.y += dt * spin * (active ? 3 : 1);
    });
    const line = hovered || (lit && active) ? 'glow' : lit ? 'mid' : 'faint';
    return h('group', null,
      h(Solid, { shape: 'cylinder', args: [0.3, 0.35, 0.06, 16], position: [0, 0.03, 0] }),
      h(Solid, { shape: 'cylinder', args: [0.03, 0.03, height, 6], position: [0, height / 2, 0], line: 'mid' }),
      h(Solid, { ref: shade, hotspot: 'shade', shape: 'cone', args: [0.4, 0.5, 12, 1, true], position: [0, height, 0], fill: 'fine', line }),
      lit && h(Segs, { line: 'faint', points: [0, height - 0.25, 0, 0.9, 0.02, 0.9, 0, height - 0.25, 0, -0.9, 0.02, 0.9, 0, height - 0.25, 0, 0.9, 0.02, -0.9, 0, height - 0.25, 0, -0.9, 0.02, -0.9] }),
    );
  };
}
