/**
 * What the wheel means while flying, with no DOM, so it runs in tests.
 *
 * A mouse wheel and a two-finger scroll on a touchpad arrive as the same event and cannot be told apart, so both
 * slide the camera along the gaze by `deltaY`; only a touchpad (or a tilting wheel) also has `deltaX`, which slides
 * it sideways. A pinch on a touchpad arrives as a wheel event with `ctrlKey` set (Chrome, Firefox, Edge), its
 * `deltaY` about a hundredth of what a wheel sends for the same intent; Safari sends `gesturechange` with a scale
 * instead, which `pinchDelta` turns into the same unit.
 */

/** How much stronger a pinch is than the same wheel delta: spreading the fingers to twice the distance is about 3.5 m. */
export const PINCH_GAIN = 10;

/** The event is a touchpad pinch (or Ctrl + wheel, which the browser would answer by zooming the page). */
export const isPinch = e => !!e.ctrlKey;

/**
 * `{ dolly, slide }` in wheel units: `dolly` along the gaze (negative is forward: fingers apart, or the wheel away
 * from you), `slide` along the camera's right (positive is right).
 */
export function wheelFly(e) {
  if (isPinch(e)) return { dolly: e.deltaY * PINCH_GAIN, slide: 0 };
  return { dolly: e.deltaY, slide: e.deltaX || 0 };
}

/** Safari's pinch: the wheel `deltaY` a Chrome pinch from scale `prev` to `scale` would have sent (scale = e^(−deltaY / 100)). */
export function pinchDelta(prev, scale) {
  if (!(prev > 0) || !(scale > 0)) return 0;
  return -100 * Math.log(scale / prev);
}
