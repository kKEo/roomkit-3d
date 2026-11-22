/**
 * Interior walls (`room.walls`): straight walls inside the footprint that split one scene into several rooms,
 * with openings (doorways) a visitor's camera can pass through. Pure maths, no three.js, so the loader, the
 * scene checks and the tests can use it.
 *
 * A wall runs from `from` to `to`, `thickness` metres thick and `height` metres high (default: the ceiling).
 * Each opening is a gap `width` wide and `height` high, its centre `along` (0–1) or `distance` (metres) from
 * `from`. What is left of the wall is a list of solid pieces: full-height stretches between the openings, and a
 * lintel over each opening lower than the wall.
 */
import { containsPoint, walls as outerWalls } from './footprint.js';

const COMPASS = [['north', 0, -1], ['south', 0, 1], ['east', 1, 0], ['west', -1, 0]];
/** The compass side a floor direction [x, z] points to most (north is −Z). */
const sideOf = ([x, z]) => COMPASS.reduce((best, c) => (x * c[1] + z * c[2] > x * best[1] + z * best[2] ? c : best))[0];

/**
 * Each interior wall with its measures worked out: `{ index, name, a, b, length, dir, normal, thickness, height,
 * openings: [{ index, centre: [x, z], from, to, width, height }] }`. `from` and `to` of an opening are metres
 * along the wall from `a`, not clamped (the checks report one that sticks out); `normal` is one of the wall's two
 * sides, the left one seen from `a` looking at `b`.
 */
export function interiorWalls(room) {
  return (room.walls ?? []).map((w, index) => {
    const a = w.from, b = w.to, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1e-9;
    const dir = [dx / length, dz / length], height = Math.min(w.height ?? room.height, room.height);
    const openings = (w.openings ?? []).map((o, k) => {
      const d = o.distance ?? (o.along ?? 0.5) * length;
      return { index: k, centre: [a[0] + dir[0] * d, a[1] + dir[1] * d], from: d - o.width / 2, to: d + o.width / 2, width: o.width, height: Math.min(o.height, height) };
    });
    return { index, name: w.name, a, b, length, dir, normal: [dir[1], -dir[0]], thickness: w.thickness ?? 0.2, height, openings };
  });
}

const at = (w, d) => [w.a[0] + w.dir[0] * d, w.a[1] + w.dir[1] * d];

/**
 * The solid parts of the interior walls, as boxes standing on the floor plan: `{ wall, a, b, length, y0, y1,
 * thickness, centre: [x, z], yaw, poly }`. `yaw` (radians) turns a box whose length runs along local x onto the
 * wall; `poly` is its floor outline.
 */
export function wallPieces(room) {
  const out = [];
  for (const w of interiorWalls(room)) {
    const piece = (d0, d1, y0, y1) => {
      if (d1 - d0 < 1e-3 || y1 - y0 < 1e-3) return;
      const a = at(w, d0), b = at(w, d1), h = w.thickness / 2, [nx, nz] = w.normal;
      out.push({
        wall: w.name, a, b, length: d1 - d0, y0, y1, thickness: w.thickness,
        centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], yaw: Math.atan2(-w.dir[1], w.dir[0]),
        poly: [[a[0] + nx * h, a[1] + nz * h], [b[0] + nx * h, b[1] + nz * h], [b[0] - nx * h, b[1] - nz * h], [a[0] - nx * h, a[1] - nz * h]],
      });
    };
    let cursor = 0;
    for (const o of [...w.openings].sort((p, q) => p.from - q.from)) {
      const from = Math.max(cursor, o.from), to = Math.min(w.length, o.to);
      if (to <= from) continue;
      piece(cursor, from, 0, w.height);
      piece(from, to, o.height, w.height); // the lintel
      cursor = to;
    }
    piece(cursor, w.length, 0, w.height);
  }
  return out;
}

/**
 * The two faces of every interior wall, as entries of the same shape as `walls(footprint)` (src/lib/footprint.js)
 * so placement, the checks and the read-back treat them like the room's own walls: `{ a, b, length, dir, normal,
 * right, left, compass: null, name, interior, face, pad }`. `face` is the compass side the face looks to ("south"
 * is the face seen from the south), `normal` points that way, and `a`–`b` is the face's line, half the thickness
 * out from the wall's centre line. `pad` is that half thickness.
 */
export function wallFaces(room) {
  const out = [];
  for (const w of interiorWalls(room)) {
    for (const normal of [w.normal, [-w.normal[0], -w.normal[1]]]) {
      const h = w.thickness / 2, a = [w.a[0] + normal[0] * h, w.a[1] + normal[1] * h], b = [w.b[0] + normal[0] * h, w.b[1] + normal[1] * h];
      const right = [normal[1], -normal[0]];
      const left = a[0] * right[0] + a[1] * right[1] <= b[0] * right[0] + b[1] * right[1] ? a : b;
      const face = sideOf(normal);
      out.push({ a, b, length: w.length, dir: w.dir, normal, right, left, compass: null, interior: w.name, face, pad: h, name: `${face} face of "${w.name}"` });
    }
  }
  return out;
}

/** Every wall something can hang on or stand against: the footprint's edges, then both faces of each interior wall. */
export const roomWalls = room => [...outerWalls(room.footprint), ...wallFaces(room)];

/** Whether segment p–q (floor points) touches the convex outline. */
function hitsPoly(poly, p, q) {
  if (containsPoint(poly, ...p) || containsPoint(poly, ...q)) return true;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i], d = poly[(i + 1) % poly.length];
    const r = [q[0] - p[0], q[1] - p[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - p[0]) * s[1] - (c[1] - p[1]) * s[0]) / den, u = ((c[0] - p[0]) * r[1] - (c[1] - p[1]) * r[0]) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/** How far a routed flight keeps from a wall, and how far before and after a doorway it lines up with it. */
const CLEAR = 0.4, APPROACH = 1.4;

/**
 * The doorways a flight from `p0` to `p1` (world [x, y, z]) has to pass through, as waypoints [x, y, z] in
 * order: before, in and after each opening. Null when nothing is in the way, when either end is outside the room
 * (the intro and overview fly over the walls), or when no way through the openings joins the two. Only walls
 * that reach to within a metre of the ceiling are in the way; a flight goes over a lower one. A doorway is
 * passed at 0.7 m under its top, at least 1 m above the floor.
 */
export function route(room, p0, p1) {
  const inRoom = p => p[1] > 0 && p[1] < room.height && containsPoint(room.footprint, p[0], p[2]);
  if (!inRoom(p0) || !inRoom(p1)) return null;
  const tall = interiorWalls(room).filter(w => w.height >= room.height - 1);
  if (!tall.length) return null;
  // each tall wall as one block (openings included), grown by the clearance
  const blocks = tall.map(w => {
    const h = w.thickness / 2 + CLEAR, [nx, nz] = w.normal, a = at(w, -CLEAR), b = at(w, w.length + CLEAR);
    return [[a[0] + nx * h, a[1] + nz * h], [b[0] + nx * h, b[1] + nz * h], [b[0] - nx * h, b[1] - nz * h], [a[0] - nx * h, a[1] - nz * h]];
  });
  const clear = (p, q, skip = -1) => blocks.every((poly, i) => i === skip || !hitsPoly(poly, p, q));
  const flat = p => [p[0], p[2]];
  if (clear(flat(p0), flat(p1))) return null;

  // the graph: both ends, and the two sides of each doorway wide enough to fly through
  const nodes = [{ p: p0 }, { p: p1 }];
  tall.forEach((w, i) => {
    for (const o of w.openings) {
      if (o.width < 0.8 || o.from < 0 || o.to > w.length) continue;
      const y = Math.max(1, o.height - 0.7), [cx, cz] = o.centre, [nx, nz] = w.normal;
      const s = nodes.length;
      nodes.push({ p: [cx + nx * APPROACH, y, cz + nz * APPROACH], door: [cx, y, cz], wall: i, pair: s + 1 }, { p: [cx - nx * APPROACH, y, cz - nz * APPROACH], door: [cx, y, cz], wall: i, pair: s });
    }
  });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const linked = (i, j) => (nodes[i].pair === j ? clear(flat(nodes[i].p), flat(nodes[j].p), nodes[i].wall) : clear(flat(nodes[i].p), flat(nodes[j].p)));

  // Dijkstra from node 0 to node 1; a few dozen nodes at most
  const best = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  best[0] = 0;
  for (;;) {
    let i = -1;
    for (let k = 0; k < nodes.length; k++) if (!done[k] && best[k] < Infinity && (i < 0 || best[k] < best[i])) i = k;
    if (i < 0 || i === 1) break;
    done[i] = true;
    for (let j = 0; j < nodes.length; j++) {
      if (done[j] || j === i) continue;
      const d = best[i] + dist(nodes[i].p, nodes[j].p);
      if (d < best[j] && linked(i, j)) { best[j] = d; prev[j] = i; }
    }
  }
  if (best[1] === Infinity) return null;
  const path = [];
  for (let i = prev[1]; i > 0; i = prev[i]) path.unshift(i);
  // through a doorway the path goes side, centre, side: put the centre between each pair
  const out = [];
  for (let k = 0; k < path.length; k++) {
    const nd = nodes[path[k]];
    out.push(nd.p);
    if (path[k + 1] === nd.pair) out.push(nd.door);
  }
  return out;
}
