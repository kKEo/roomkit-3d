import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEG, toRad, objectMatrix, circlePts, rgba } from '../src/lib/math.js';

describe('toRad', () => {
  it('converts a degree triple', () => {
    expect(toRad([180, 90, 0])).toEqual([Math.PI, Math.PI / 2, 0]);
    expect(toRad()).toEqual([0, 0, 0]);
    expect(DEG * 180).toBeCloseTo(Math.PI);
  });
});

describe('objectMatrix', () => {
  it('composes position, degree rotation and uniform scale', () => {
    const m = objectMatrix({ position: [1, 2, 3], rotation: [0, 90, 0], scale: 2 });
    const p = new THREE.Vector3(0, 0, 1).applyMatrix4(m); // local +Z, scaled by 2, turned to +X, then moved
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
  });

  it('accepts a per-axis scale', () => {
    const m = objectMatrix({ position: [0, 0, 0], scale: [1, 2, 3] });
    const p = new THREE.Vector3(1, 1, 1).applyMatrix4(m);
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3]);
  });
});

describe('circlePts', () => {
  it('returns n segments of 6 numbers on a circle of radius r', () => {
    const pts = circlePts(2, 8, 0.5);
    expect(pts.length).toBe(8 * 6);
    for (let i = 0; i < pts.length; i += 3) {
      expect(Math.hypot(pts[i], pts[i + 2])).toBeCloseTo(2);
      expect(pts[i + 1]).toBe(0.5);
    }
  });
});

describe('rgba', () => {
  it('turns a hex colour and alpha into an rgba() string', () => {
    expect(rgba('#00ff66', 0.28)).toBe('rgba(0,255,102,0.28)');
  });
});
