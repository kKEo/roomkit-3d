import { describe, it, expect } from 'vitest';
import { orderScreens, firstScreen, moveScreen } from '../src/lib/screenOrder.js';

// a wall of three frames at x = -16, seen from a camera east of them looking west (-x): "right" is -z
const camera = { position: [-5.5, 4, -8.5], target: [-16, 3.9, -8.5] };
const rec = (key, center, h = 1) => ({ key, center, h });
const left = rec('left', [-16, 4.2, -4]), mid = rec('mid', [-16, 4.2, -8.5]), right = rec('right', [-16, 4.2, -13]);

// a control wall: 2 rows × 3 columns plus one screen that wraps onto a third row, 0.6 m wide × 0.35 m high
const grid = {};
for (const [r, c] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0]]) {
  grid[`${r}${c}`] = rec(`${r}${c}`, [-16, 3 - r * 0.45, -7.5 - c * 0.7], 0.35);
}
const wall = Object.values(grid);

describe('orderScreens', () => {
  it('sorts left to right as seen from the POI camera, whatever the registration order', () => {
    expect(orderScreens([right, left, mid], camera).map(r => r.key)).toEqual(['left', 'mid', 'right']);
  });

  it('reads a grid top row first, each row left to right', () => {
    expect(orderScreens([...wall].reverse(), camera).map(r => r.key)).toEqual(['00', '01', '02', '10', '11', '12', '20']);
  });

  it('uses the world axes without a camera', () => {
    expect(orderScreens([rec('b', [2, 1, 0]), rec('a', [-2, 1, 0])], null).map(r => r.key)).toEqual(['a', 'b']);
  });
});

describe('firstScreen', () => {
  it('is the top-left screen, or null', () => {
    expect(firstScreen([right, mid, left], camera)).toBe(left);
    expect(firstScreen(wall.slice().reverse(), camera)).toBe(grid['00']);
    expect(firstScreen([], camera)).toBe(null);
  });
});

describe('moveScreen', () => {
  it('moves along a row and stops at its ends instead of wrapping', () => {
    const all = [right, left, mid];
    expect(moveScreen(all, camera, 'left', 'right')).toBe(mid);
    expect(moveScreen(all, camera, 'mid', 'right')).toBe(right);
    expect(moveScreen(all, camera, 'right', 'right')).toBe(null);
    expect(moveScreen(all, camera, 'mid', 'left')).toBe(left);
    expect(moveScreen(all, camera, 'left', 'left')).toBe(null);
  });

  it('a single row has nothing above or below', () => {
    expect(moveScreen([right, left, mid], camera, 'mid', 'up')).toBe(null);
    expect(moveScreen([right, left, mid], camera, 'mid', 'down')).toBe(null);
  });

  it('follows the arrow pressed through a grid', () => {
    expect(moveScreen(wall, camera, '00', 'right')).toBe(grid['01']);
    expect(moveScreen(wall, camera, '00', 'down')).toBe(grid['10']);
    expect(moveScreen(wall, camera, '11', 'up')).toBe(grid['01']);
    expect(moveScreen(wall, camera, '11', 'left')).toBe(grid['10']);
    expect(moveScreen(wall, camera, '10', 'down')).toBe(grid['20']);
    expect(moveScreen(wall, camera, '20', 'up')).toBe(grid['10']);
  });

  it('stops at the edges of the grid, including where the last row is shorter', () => {
    expect(moveScreen(wall, camera, '02', 'right')).toBe(null);
    expect(moveScreen(wall, camera, '02', 'up')).toBe(null);
    expect(moveScreen(wall, camera, '12', 'down')).toBe(null); // nothing under it: no jump to the lone screen at the left
    expect(moveScreen(wall, camera, '11', 'down')).toBe(null);
    expect(moveScreen(wall, camera, '20', 'right')).toBe(null);
    expect(moveScreen(wall, camera, '20', 'down')).toBe(null);
  });

  it('has nowhere to go with a single screen, and starts from the first for an unknown key', () => {
    expect(moveScreen([mid], camera, 'mid', 'right')).toBe(null);
    expect(moveScreen([right, left], camera, 'gone', 'right')).toBe(left);
    expect(moveScreen([right, left], camera, 'left', 'sideways')).toBe(null);
  });
});
