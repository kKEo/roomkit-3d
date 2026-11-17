import { describe, it, expect } from 'vitest';
import { createGestures, TAP_SLOP } from '../src/lib/touch.js';

describe('touch gestures', () => {
  it('keeps a finger that barely moves a tap', () => {
    const g = createGestures();
    g.down(1, 100, 100);
    expect(g.move(1, 100 + TAP_SLOP - 1, 100)).toBeNull();
    expect(g.dragging).toBe(false);
    g.up(1);
    expect(g.count).toBe(0);
  });

  it('starts the drag where the finger left the tap, without a jump', () => {
    const g = createGestures();
    g.down(1, 100, 100);
    expect(g.move(1, 120, 100)).toEqual({ look: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, pinch: 0 });
    expect(g.dragging).toBe(true);
    expect(g.move(1, 125, 97).look).toEqual({ x: 5, y: -3 });
    // back inside the slop it is still a drag
    expect(g.move(1, 101, 100).look).toEqual({ x: -24, y: 3 });
  });

  it('reads two fingers moving apart as a pinch and nothing else', () => {
    const g = createGestures();
    g.down(1, 100, 200); g.down(2, 200, 200);
    const a = g.move(1, 90, 200), b = g.move(2, 210, 200);
    expect(a.pinch + b.pinch).toBe(20);
    expect(a.pan.x + b.pan.x).toBe(0);
    expect(a.look).toEqual({ x: 0, y: 0 });
    expect(g.move(2, 190, 200).pinch).toBe(-20);
  });

  it('reads two fingers moving together as a pan', () => {
    const g = createGestures();
    g.down(1, 100, 200); g.down(2, 200, 200);
    const a = g.move(1, 110, 220), b = g.move(2, 210, 220);
    expect(a.pan.x + b.pan.x).toBe(10);
    expect(a.pan.y + b.pan.y).toBe(20);
    expect(a.pinch + b.pinch).toBeCloseTo(0, 6);
  });

  it('a second finger ends the tap at once, and lifting one carries on as a look from where the other is', () => {
    const g = createGestures();
    g.down(1, 100, 100); g.down(2, 300, 100);
    expect(g.dragging).toBe(true);
    g.move(2, 320, 100);
    g.up(2);
    expect(g.count).toBe(1);
    expect(g.move(1, 103, 100)).toEqual({ look: { x: 3, y: 0 }, pan: { x: 0, y: 0 }, pinch: 0 });
  });

  it('ignores a third finger and pointers it never saw go down', () => {
    const g = createGestures();
    expect(g.move(9, 1, 1)).toBeNull();
    g.down(1, 0, 0); g.down(2, 100, 0); g.down(3, 50, 50);
    expect(g.move(3, 80, 80)).toBeNull();
    expect(g.move(2, 110, 0).pinch).toBe(10);
  });

  it('forgets everything on cancel', () => {
    const g = createGestures();
    g.down(1, 0, 0); g.move(1, 50, 0);
    g.cancel();
    expect(g.count).toBe(0);
    expect(g.dragging).toBe(false);
    expect(g.move(1, 60, 0)).toBeNull();
    g.down(1, 0, 0);
    expect(g.move(1, 2, 0)).toBeNull();
  });
});
