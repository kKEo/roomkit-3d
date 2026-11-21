/**
 * Keeping a hand-flown camera inside the room: the camera is a small ball that slides along walls, pillars,
 * the floor and the ceiling instead of passing through them. Pure maths, no three.js, so it runs in Node.
 *
 * A camera that starts a move outside the room (the intro and overview poses stand outside on purpose) moves
 * freely; once inside, it stays inside.
 */
import { containsPoint, edges } from './footprint.js';

/** How close (m) the camera's centre may come to a wall, a pillar, the floor or the ceiling. */
export const CAMERA_RADIUS = 0.3;
/** Half the side of a pillar's base block (src/scene/Room.jsx; the lint's PILLAR_HALF). */
const PILLAR_HALF = 0.75;

/**
 * What a camera bumps into in this room: `{ footprint, height, radius, segments }`. Each segment is
 * `{ a: [x, z], b: [x, z], pad, y0, y1 }`: a vertical wall strip from `y0` to `y1`, `pad` metres thick on each side.
 * `room` is a scene's room with its footprint filled in (`withFootprint`); `walls` is a list of extra
 * `{ a, b, pad, y0, y1 }` strips (interior walls).
 */
export function roomColliders(room, { radius = CAMERA_RADIUS, walls = [] } = {}) {
  const segments = edges(room.footprint).map(({ a, b }) => ({ a, b, pad: 0, y0: -Infinity, y1: Infinity }));
  for (const [x, z] of room.pillars ?? []) {
    const h = PILLAR_HALF, c = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
    c.forEach((a, i) => segments.push({ a, b: c[(i + 1) % 4], pad: 0, y0: -Infinity, y1: Infinity }));
  }
  segments.push(...walls);
  return { footprint: room.footprint, height: room.height, radius, segments };
}

/** Whether a point {x, y, z} is inside the room: over the floor plan and under the ceiling. */
export function insideRoom(c, p) {
  return p.y < c.height && p.y > 0 && containsPoint(c.footprint, p.x, p.z);
}

/** Push p out of one segment's reach, in place; true when it had to move. */
function pushOut(p, { a, b, pad, y0, y1 }, r) {
  if (p.y < y0 - r || p.y > y1 + r) return false;
  const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / len2)) : 0;
  const qx = a[0] + dx * t, qz = a[1] + dz * t;
  let ox = p.x - qx, oz = p.z - qz;
  const d = Math.hypot(ox, oz), reach = r + pad;
  if (d >= reach) return false;
  if (d < 1e-9) { const l = Math.sqrt(len2) || 1; ox = -dz / l; oz = dx / l; } else { ox /= d; oz /= d; }
  p.x = qx + ox * reach; p.z = qz + oz * reach;
  return true;
}

/**
 * Move from `from` towards `to` (both {x, y, z}), sliding along whatever is in the way; writes the result into
 * `to` and returns it. The move is cut into steps shorter than half the radius, so a fast camera cannot jump
 * through a thin wall. Outside the room nothing stops it.
 */
export function collide(c, from, to) {
  if (!insideRoom(c, from)) return to;
  const r = c.radius;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const n = Math.min(200, Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / (r * 0.5))));
  const p = { x: from.x, y: from.y, z: from.z };
  for (let i = 0; i < n; i++) {
    const prev = { x: p.x, y: p.y, z: p.z };
    p.x += dx / n; p.y += dy / n; p.z += dz / n;
    p.y = Math.min(c.height - r, Math.max(r, p.y));
    for (let k = 0; k < 4; k++) {
      let moved = false;
      for (const s of c.segments) moved = pushOut(p, s, r) || moved;
      if (!moved) break;
    }
    // squeezed out of the floor plan (a sharp outside corner): stay where the last step ended
    if (!containsPoint(c.footprint, p.x, p.z)) { p.x = prev.x; p.y = prev.y; p.z = prev.z; break; }
  }
  to.x = p.x; to.y = p.y; to.z = p.z;
  return to;
}
