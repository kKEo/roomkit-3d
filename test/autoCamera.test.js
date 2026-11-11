import { describe, it, expect } from 'vitest';
import { autoPlacement, clampCamera, overviewCamera } from '../src/lib/autoCamera.js';
import { PREFABS } from '../src/prefabs/registry.js';

const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('overviewCamera', () => {
  it('stands outside the front wall, above the ceiling, looking into the room', () => {
    const { position, target } = overviewCamera({ width: 30, height: 9, depth: 30 });
    expect(position[1]).toBeGreaterThan(9);
    expect(position[2]).toBeGreaterThan(15);
    expect(target[2]).toBeLessThan(0);
    expect(target[1]).toBe(0);
  });

  it('scales with the larger horizontal dimension', () => {
    const a = overviewCamera({ width: 10, height: 5, depth: 10 });
    const b = overviewCamera({ width: 10, height: 5, depth: 40 });
    expect(b.position[1]).toBeGreaterThan(a.position[1]);
  });
});

describe('autoPlacement', () => {
  const hints = { focus: [0, 1, 0], cameraDistance: 5, cameraHeight: 2, markerOffset: [0, 3, 0] };

  it('puts the camera in front of an unrotated object (+Z) at the given height', () => {
    const { camera, marker } = autoPlacement({ position: [2, 0, -4] }, hints);
    expect(close(camera.target, [2, 1, -4])).toBe(true);
    expect(close(camera.position, [2, 2, 1])).toBe(true);
    expect(close(marker.position, [2, 3, -4])).toBe(true);
  });

  it('follows a y rotation: an object turned 90° faces +X', () => {
    const { camera } = autoPlacement({ position: [0, 0, 0], rotation: [0, 90, 0] }, hints);
    expect(close(camera.position, [5, 2, 0])).toBe(true);
  });

  it('defaults the camera height to focus.y + 0.3 when cameraHeight is null', () => {
    const { camera } = autoPlacement({ position: [0, 0, 0] }, { ...hints, cameraHeight: null });
    expect(camera.position[1]).toBeCloseTo(1.3);
  });

  it('scales the marker offset and focus with the object scale', () => {
    const { camera, marker } = autoPlacement({ position: [0, 0, 0], scale: 2 }, hints);
    expect(marker.position[1]).toBeCloseTo(6);
    expect(camera.target[1]).toBeCloseTo(2);
  });

  it('works with every registered prefab and its default props', () => {
    for (const [type, meta] of Object.entries(PREFABS)) {
      const { camera, marker } = autoPlacement({ type, position: [0, 0, 0] }, meta.placement(meta.props));
      for (const v of [...camera.position, ...camera.target, ...marker.position]) expect(Number.isFinite(v), type).toBe(true);
    }
  });
});

describe('clampCamera', () => {
  const room = [[-5, -5], [5, -5], [5, 5], [-5, 5]];

  it('leaves a camera inside the room alone', () => {
    const cam = { position: [0, 2, 4], target: [0, 1, 0] };
    expect(clampCamera(cam, room)).toBe(cam);
  });

  it('pulls a camera behind a wall back along its line of sight, keeping its height', () => {
    const { position, target } = clampCamera({ position: [0, 2, 12], target: [0, 1, 0] }, room);
    expect(position).toEqual([0, 2, 4.4]);
    expect(target).toEqual([0, 1, 0]);
  });

  it('never gets closer than half way when the target is at the wall', () => {
    expect(clampCamera({ position: [0, 2, 12], target: [0, 1, 4.5] }, room).position[2]).toBeCloseTo(4.75);
  });
});
