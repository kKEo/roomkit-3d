/** How far (px) a finger may wander and still be a tap; past it the touch is a drag. Above the 8 px a click allows. */
export const TAP_SLOP = 10;

const none = () => ({ look: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, pinch: 0 });

/**
 * Turns the touch pointers on the room into camera gestures, in pixels and with no DOM, so it runs in tests.
 *
 * One finger is a tap until it has moved `slop` px from where it landed; from then on each `move` gives how far
 * it went as `look`. Two fingers give `pan` (how far the point between them moved) and `pinch` (how much further
 * apart they are; negative when closing). A third finger is ignored. Every delta is measured from the previous
 * `move`, so lifting or adding a finger never makes the view jump.
 *
 * `move` returns `{ look: { x, y }, pan: { x, y }, pinch }`, or null while the touch is still a tap or the
 * pointer is not one of the two that count.
 */
export function createGestures(slop = TAP_SLOP) {
  const pts = new Map(); // pointer id -> { x, y }, in the order the fingers landed
  let start = null, dragging = false;
  const pair = () => { const [a, b] = pts.values(); return { a, b }; };
  return {
    /** Fingers down. */
    get count() { return pts.size; },
    /** True once the touch has stopped being a tap. */
    get dragging() { return dragging; },
    down(id, x, y) {
      pts.set(id, { x, y });
      if (pts.size === 1) { start = { x, y }; dragging = false; } else dragging = true;
    },
    move(id, x, y) {
      const p = pts.get(id);
      if (!p) return null;
      const out = none();
      if (pts.size === 1) {
        if (!dragging) {
          if (Math.hypot(x - start.x, y - start.y) < slop) return null;
          dragging = true; // the drag starts here, not where the finger landed: no jump by the slop
        } else { out.look.x = x - p.x; out.look.y = y - p.y; }
        p.x = x; p.y = y;
        return out;
      }
      const { a, b } = pair();
      if (p !== a && p !== b) { p.x = x; p.y = y; return null; }
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = x; p.y = y;
      out.pan.x = (a.x + b.x) / 2 - cx; out.pan.y = (a.y + b.y) / 2 - cy;
      out.pinch = Math.hypot(a.x - b.x, a.y - b.y) - d;
      return out;
    },
    up(id) {
      pts.delete(id);
      if (!pts.size) { start = null; dragging = false; }
    },
    /** Forget every finger (the window lost focus, the browser took the touch over). */
    cancel() { pts.clear(); start = null; dragging = false; },
  };
}
