/**
 * Room footprints: a simple polygon of [x, z] corners on the floor (any winding, no self-intersections).
 * Pure maths, no three.js, so the loader and the tests can use it.
 */

/** Axis-aligned rectangle of `width` × `depth` centred on the origin, the classic room. */
export const rectFootprint = (width, depth) => [
  [-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2],
];

export function bounds(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/** Signed area (shoelace); the sign tells the winding. */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n]; a += x0 * z1 - x1 * z0; }
  return a / 2;
}

/** Area-weighted centroid [x, z]. */
export function centroid(poly) {
  const A = signedArea(poly);
  if (Math.abs(A) < 1e-9) { const b = bounds(poly); return [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]; }
  let cx = 0, cz = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n], f = x0 * z1 - x1 * z0;
    cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  return [cx / (6 * A), cz / (6 * A)];
}

/** Ray-casting point-in-polygon; points on an edge may go either way. */
export function containsPoint(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The polygon's edges as { a: [x,z], b: [x,z], length, dir: [dx,dz], normal: [nx,nz] (pointing into the room) }. */
export function edges(poly) {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
    const dir = [dx / length, dz / length];
    let normal = [-dir[1], dir[0]];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!containsPoint(poly, mx + normal[0] * 1e-3, mz + normal[1] * 1e-3)) normal = [dir[1], -dir[0]];
    return { a, b, length, dir, normal };
  });
}

/** Parameter t along segment A→B where it crosses segment C→D, or null (parallel or no crossing). */
function crossing(ax, az, bx, bz, cx, cz, dx, dz) {
  const r = [bx - ax, bz - az], s = [dx - cx, dz - cz];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const qp = [cx - ax, cz - az];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The parts of segment A→B that lie inside the polygon, as [[x0,z0,x1,z1], …]. */
export function clipSegment(poly, ax, az, bx, bz) {
  const ts = [0, 1];
  for (let i = 0, n = poly.length; i < n; i++) {
    const [cx, cz] = poly[i], [dx, dz] = poly[(i + 1) % n];
    const t = crossing(ax, az, bx, bz, cx, cz, dx, dz);
    if (t != null) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const tm = (t0 + t1) / 2;
    if (containsPoint(poly, ax + (bx - ax) * tm, az + (bz - az) * tm)) {
      out.push([ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1]);
    }
  }
  return out;
}

/**
 * Grid lines every `step` metres, clipped to the polygon, as a flat [x,y,z, x,y,z, …] segment list at height `y`.
 * Lines on the outer bounds are skipped (the walls draw their own outline).
 */
export function gridSegments(poly, step, y) {
  const out = [];
  if (!step) return out;
  const b = bounds(poly), eps = 1e-6;
  for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX + eps; x += step) {
    if (x - b.minX < eps || b.maxX - x < eps) continue;
    for (const [x0, z0, x1, z1] of clipSegment(poly, x, b.minZ - 1, x, b.maxZ + 1)) out.push(x0, y, z0, x1, y, z1);
  }
  for (let z = Math.ceil(b.minZ / step) * step; z <= b.maxZ + eps; z += step) {
    if (z - b.minZ < eps || b.maxZ - z < eps) continue;
    for (const [x0, z0, x1, z1] of clipSegment(poly, b.minX - 1, z, b.maxX + 1, z)) out.push(x0, y, z0, x1, y, z1);
  }
  return out;
}

/** A random point inside the polygon (rejection sampling over the bounds). */
export function randomPoint(poly, b = bounds(poly), rnd = Math.random) {
  for (let i = 0; i < 64; i++) {
    const x = b.minX + rnd() * b.width, z = b.minZ + rnd() * b.depth;
    if (containsPoint(poly, x, z)) return [x, z];
  }
  return centroid(poly);
}

/**
 * The room with its footprint and derived figures filled in: `footprint` (default: the width × depth rectangle),
 * `bounds`, `centre` [x, z], and `width`/`depth` set to the footprint's extent.
 */
export function withFootprint(room) {
  const footprint = room.footprint ?? rectFootprint(room.width, room.depth);
  const b = bounds(footprint);
  return { ...room, footprint, bounds: b, centre: centroid(footprint), width: b.width, depth: b.depth };
}

/** Distance from a point to segment A→B. */
export function distToSegment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

const COMPASS = [['north', 0, 1], ['south', 0, -1], ['east', -1, 0], ['west', 1, 0]];

/**
 * The room's walls: `edges(poly)` with `index`, `compass` and `name`. North is −Z, so the north wall is the one
 * whose inner side faces +Z; `compass` is null for a wall that runs at an angle. `name` is what to call the wall
 * in a message: its compass side when only one wall has it, else "south wall (edge 2)" or "wall (edge 3)".
 * `left` and `right` say which way the wall runs for someone standing in the room facing it.
 */
export function walls(poly) {
  const list = edges(poly).map((e, index) => {
    const hit = COMPASS.find(([, nx, nz]) => e.normal[0] * nx + e.normal[1] * nz > 0.999);
    // seen from inside, facing the wall: `right` is the unit direction to the right, `left` the wall's left end
    const right = [e.normal[1], -e.normal[0]];
    const left = e.a[0] * right[0] + e.a[1] * right[1] <= e.b[0] * right[0] + e.b[1] * right[1] ? e.a : e.b;
    return { ...e, index, compass: hit ? hit[0] : null, right, left };
  });
  const count = c => list.filter(w => w.compass === c).length;
  return list.map(w => ({ ...w, name: !w.compass ? `wall (edge ${w.index})` : count(w.compass) === 1 ? `${w.compass} wall` : `${w.compass} wall (edge ${w.index})` }));
}

/** The wall nearest to a point: `{ wall, distance }`. */
export function nearestWall(wallList, x, z) {
  let best = null;
  for (const wall of wallList) {
    const distance = distToSegment(x, z, wall.a, wall.b);
    if (!best || distance < best.distance) best = { wall, distance };
  }
  return best;
}

/** Inside the polygon, or within `tol` metres of its outline (a point on a wall counts as inside). */
export function insideOrNear(poly, x, z, tol = 0.05) {
  if (containsPoint(poly, x, z)) return true;
  return poly.some((a, i) => distToSegment(x, z, a, poly[(i + 1) % poly.length]) <= tol);
}

/** How far along a wall a point is, in metres from the wall's left end (seen from inside). */
export const alongWall = (wall, x, z) => (x - wall.left[0]) * wall.right[0] + (z - wall.left[1]) * wall.right[1];

/**
 * The corners a thing can stand in: the room's convex vertices, as `{ index, point, walls: [a, b], compass, name }`.
 * `index` is the vertex's number in the footprint and `walls` the two that meet there. `compass` is "north-east"
 * for the corner between a north and an east wall, null when one of its walls runs at an angle; `name` is what to
 * call the corner in a message, with its number when two corners share a compass name.
 */
export function corners(poly) {
  const list = walls(poly), n = poly.length, sign = Math.sign(signedArea(poly)) || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = list[(i - 1 + n) % n], b = list[i];
    // an inner corner (the L's elbow) or a straight run turns the other way, or not at all
    if ((a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]) * sign <= 1e-9) continue;
    const ns = [a, b].find(w => w.compass === 'north' || w.compass === 'south'), ew = [a, b].find(w => w.compass === 'east' || w.compass === 'west');
    out.push({ index: i, point: poly[i], walls: [a, b], compass: ns && ew ? `${ns.compass}-${ew.compass}` : null });
  }
  const count = c => out.filter(k => k.compass === c).length;
  return out.map(k => ({ ...k, name: !k.compass ? `corner ${k.index}` : count(k.compass) === 1 ? `${k.compass} corner` : `${k.compass} corner (${k.index})` }));
}
