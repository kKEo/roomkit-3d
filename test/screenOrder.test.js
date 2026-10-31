import { describe, it, expect } from 'vitest';
import { orderScreens, nearestScreen, stepScreen } from '../src/lib/screenOrder.js';

// a wall of three frames at x = -16, seen from a camera east of them looking west (-x): "right" is -z
const camera = { position: [-5.5, 4, -8.5], target: [-16, 3.9, -8.5] };
const rec = (key, center) => ({ key, center });
const left = rec('left', [-16, 4.2, -4]), mid = rec('mid', [-16, 4.2, -8.5]), right = rec('right', [-16, 4.2, -13]);

describe('orderScreens', () => {
  it('sorts left to right as seen from the POI camera, whatever the registration order', () => {
    expect(orderScreens([right, left, mid], camera).map(r => r.key)).toEqual(['left', 'mid', 'right']);
  });

  it('puts the upper of two stacked screens first', () => {
    const top = rec('top', [-16, 6, -8.5]), bottom = rec('bottom', [-16, 2, -8.5]);
    expect(orderScreens([bottom, top], camera).map(r => r.key)).toEqual(['top', 'bottom']);
  });

  it('keeps the given order without a camera', () => {
    expect(orderScreens([right, left], null).map(r => r.key)).toEqual(['right', 'left']);
  });
});

describe('nearestScreen', () => {
  it('picks the screen the camera looks at', () => {
    expect(nearestScreen([left, right, mid], camera)).toBe(mid);
    expect(nearestScreen([], camera)).toBe(null);
  });
});

describe('stepScreen', () => {
  it('moves right and wraps, and back left', () => {
    const all = [right, left, mid];
    expect(stepScreen(all, camera, 'mid', 1)).toBe(right);
    expect(stepScreen(all, camera, 'right', 1)).toBe(left);
    expect(stepScreen(all, camera, 'left', -1)).toBe(right);
  });

  it('has nowhere to go with a single screen, and starts from the first for an unknown key', () => {
    expect(stepScreen([mid], camera, 'mid', 1)).toBe(null);
    expect(stepScreen([right, left], camera, 'gone', 1)).toBe(left);
  });
});
