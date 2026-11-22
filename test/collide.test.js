import { describe, it, expect } from 'vitest';
import { collide, roomColliders, insideRoom, CAMERA_RADIUS } from '../src/lib/collide.js';
import { withFootprint } from '../src/lib/footprint.js';

const R = CAMERA_RADIUS;
const v = (x, y, z) => ({ x, y, z });
// a 20 × 30 room, 7 m high: walls at x = ±10, z = ±15
const box = roomColliders(withFootprint({ width: 20, depth: 30, height: 7, pillars: [] }));
// the loft's L: a 24 × 24 square missing its +x/+z quarter, with a pillar at [-6, 0]
const L = roomColliders(withFootprint({ height: 7, footprint: [[-12, -12], [12, -12], [12, 0], [0, 0], [0, 12], [-12, 12]], pillars: [[-6, 0]] }));

describe('collide', () => {
  it('lets a move that touches nothing through unchanged', () => {
    const p = collide(box, v(0, 2, 0), v(1, 2.5, -1));
    expect([p.x, p.y, p.z].map(n => +n.toFixed(9))).toEqual([1, 2.5, -1]);
  });

  it('stops at a wall, the camera radius short of it', () => {
    const p = collide(box, v(0, 2, 0), v(14, 2, 0));
    expect(p.x).toBeCloseTo(10 - R);
    expect(p.z).toBeCloseTo(0);
  });

  it('slides along a wall instead of sticking to it', () => {
    const p = collide(box, v(9, 2, 0), v(12, 2, 4));
    expect(p.x).toBeCloseTo(10 - R);
    expect(p.z).toBeCloseTo(4);
  });

  it('keeps under the ceiling and over the floor', () => {
    expect(collide(box, v(0, 5, 0), v(0, 12, 0)).y).toBeCloseTo(7 - R);
    expect(collide(box, v(0, 2, 0), v(0, -3, 0)).y).toBeCloseTo(R);
  });

  it('cannot jump through a wall in one long move', () => {
    const p = collide(L, v(6, 2, -2), v(6, 2, 20)); // across the L's inner wall at z = 0 into the missing quarter
    expect(p.z).toBeCloseTo(-R);
    expect(insideRoom(L, p)).toBe(true);
  });

  it('goes round a pillar, not through it', () => {
    const p = collide(L, v(-6, 2, -3), v(-6, 2, 3));
    expect(p.z).toBeLessThan(-0.75 - R + 1e-6);
  });

  it('holds a camera in the inner corner of the L', () => {
    const p = collide(L, v(-1, 2, -1), v(5, 2, 5));
    expect(insideRoom(L, p)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(R - 1e-6); // clear of the corner at [0, 0]
  });

  it('lets a camera outside the room fly in, and then keeps it in', () => {
    const outside = v(0, 10, 40); // the overview stands outside the south wall, above the ceiling
    expect(collide(box, outside, v(0, 4, 0))).toEqual(v(0, 4, 0));
    expect(collide(box, v(0, 4, 0), v(0, 4, 40)).z).toBeCloseTo(15 - R);
  });

  it('respects the height of an interior wall strip, so a camera can pass under a lintel only', () => {
    const lintel = roomColliders(withFootprint({ width: 20, depth: 30, height: 7, pillars: [] }), {
      walls: [{ a: [-2, 0], b: [2, 0], pad: 0.1, y0: 2.4, y1: 7 }],
    });
    expect(collide(lintel, v(0, 1.5, -3), v(0, 1.5, 3)).z).toBeCloseTo(3); // under it
    expect(collide(lintel, v(0, 4, -3), v(0, 4, 3)).z).toBeCloseTo(-0.1 - R); // into it
  });
});
