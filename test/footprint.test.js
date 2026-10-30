import { describe, it, expect } from 'vitest';
import {
  rectFootprint, bounds, signedArea, centroid, containsPoint, edges, clipSegment, gridSegments, randomPoint, withFootprint,
} from '../src/lib/footprint.js';

// an L: a 24 × 24 square missing its +x/+z quarter
const L = [[-12, -12], [12, -12], [12, 0], [0, 0], [0, 12], [-12, 12]];

describe('rectFootprint and bounds', () => {
  it('builds a centred rectangle', () => {
    expect(rectFootprint(30, 20)).toEqual([[-15, -10], [15, -10], [15, 10], [-15, 10]]);
    expect(bounds(L)).toEqual({ minX: -12, maxX: 12, minZ: -12, maxZ: 12, width: 24, depth: 24 });
  });
});

describe('area and centroid', () => {
  it('measures the L and finds its centroid in the thick corner', () => {
    expect(Math.abs(signedArea(L))).toBeCloseTo(24 * 24 * 0.75);
    const [cx, cz] = centroid(L);
    expect(cx).toBeCloseTo(-2);
    expect(cz).toBeCloseTo(-2);
    expect(centroid(rectFootprint(10, 4))).toEqual([0, 0]);
  });

  it('gives the same centroid for either winding', () => {
    expect(centroid([...L].reverse())).toEqual(centroid(L));
  });
});

describe('containsPoint', () => {
  it('knows the notch is outside', () => {
    expect(containsPoint(L, -6, -6)).toBe(true);
    expect(containsPoint(L, 6, -6)).toBe(true);
    expect(containsPoint(L, -6, 6)).toBe(true);
    expect(containsPoint(L, 6, 6)).toBe(false);
    expect(containsPoint(L, 13, 0)).toBe(false);
  });
});

describe('edges', () => {
  it('returns one edge per corner with an inward normal, whatever the winding', () => {
    for (const poly of [L, [...L].reverse()]) {
      const es = edges(poly);
      expect(es.length).toBe(6);
      for (const { a, b, normal, length } of es) {
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        expect(containsPoint(poly, mx + normal[0] * 0.1, mz + normal[1] * 0.1)).toBe(true);
        expect(length).toBeGreaterThan(0);
      }
    }
  });
});

describe('clipSegment', () => {
  it('keeps the inside part of a line that leaves through the notch', () => {
    // along z = 6: inside from x = -12 to x = 0 only
    const parts = clipSegment(L, -20, 6, 20, 6);
    expect(parts.length).toBe(1);
    const [x0, , x1] = parts[0];
    expect(Math.min(x0, x1)).toBeCloseTo(-12);
    expect(Math.max(x0, x1)).toBeCloseTo(0);
  });

  it('splits a line that crosses a concave polygon twice', () => {
    const U = [[-10, -10], [10, -10], [10, 10], [5, 10], [5, -5], [-5, -5], [-5, 10], [-10, 10]];
    const parts = clipSegment(U, -20, 5, 20, 5);
    expect(parts.length).toBe(2);
  });

  it('returns nothing for a line outside', () => {
    expect(clipSegment(L, 6, 20, 6, 30)).toEqual([]);
  });
});

describe('gridSegments', () => {
  it('draws no lines on the outer bounds and none inside the notch', () => {
    const segs = gridSegments(L, 6, 0.5);
    expect(segs.length % 6).toBe(0);
    for (let i = 0; i < segs.length; i += 6) {
      const [x0, y, z0, x1, , z1] = segs.slice(i, i + 6);
      expect(y).toBe(0.5);
      expect(Math.abs(x0) < 12 - 1e-6 || Math.abs(z0) < 12 - 1e-6).toBe(true);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      expect(mx > 1e-3 && mz > 1e-3).toBe(false);
    }
    expect(gridSegments(L, 0, 0)).toEqual([]);
  });
});

describe('randomPoint', () => {
  it('always lands inside', () => {
    for (let i = 0; i < 200; i++) { const [x, z] = randomPoint(L); expect(containsPoint(L, x, z)).toBe(true); }
  });
});

describe('withFootprint', () => {
  it('defaults to the rectangle and derives width, depth, bounds and centre', () => {
    const r = withFootprint({ width: 30, height: 9, depth: 20 });
    expect(r.footprint).toEqual(rectFootprint(30, 20));
    expect(r.centre).toEqual([0, 0]);
    expect(r.width).toBe(30);
  });

  it('lets a footprint override width and depth', () => {
    const r = withFootprint({ width: 1, height: 7, depth: 1, footprint: L });
    expect(r.width).toBe(24);
    expect(r.depth).toBe(24);
    expect(r.bounds.maxZ).toBe(12);
  });
});
