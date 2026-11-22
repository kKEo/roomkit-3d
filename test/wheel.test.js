import { describe, it, expect } from 'vitest';
import { isPinch, wheelFly, pinchDelta, PINCH_GAIN } from '../src/lib/wheel.js';

describe('the wheel while flying', () => {
  it('slides along the gaze by a plain wheel, and sideways by a sideways scroll', () => {
    expect(wheelFly({ deltaY: 100 })).toEqual({ dolly: 100, slide: 0 });
    expect(wheelFly({ deltaY: -4, deltaX: 12 })).toEqual({ dolly: -4, slide: 12 });
  });

  it('reads a wheel event with Ctrl as a touchpad pinch: stronger, and never sideways', () => {
    expect(isPinch({ ctrlKey: true })).toBe(true);
    expect(isPinch({})).toBe(false);
    expect(wheelFly({ ctrlKey: true, deltaY: -3, deltaX: 7 })).toEqual({ dolly: -3 * PINCH_GAIN, slide: 0 });
  });

  it('turns a Safari pinch scale into the same unit: apart is forward (negative), together is back', () => {
    expect(pinchDelta(1, 2)).toBeCloseTo(-100 * Math.LN2);
    expect(pinchDelta(2, 1)).toBeCloseTo(100 * Math.LN2);
    expect(pinchDelta(1.5, 1.5)).toBeCloseTo(0);
    // in steps it adds up to the same as at once
    expect(pinchDelta(1, 1.3) + pinchDelta(1.3, 2)).toBeCloseTo(pinchDelta(1, 2));
  });

  it('ignores a scale that makes no sense', () => {
    expect(pinchDelta(0, 2)).toBe(0);
    expect(pinchDelta(1, 0)).toBe(0);
    expect(pinchDelta(1, NaN)).toBe(0);
  });
});
