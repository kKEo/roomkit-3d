import { walls } from '../lib/footprint.js';

/**
 * Placement by words instead of coordinates: an object may say `"at": { "wall": "north", "along": 0.4 }`
 * in place of `position` and `rotation`, and the loader works those out here, before anything renders.
 *
 * - `wall`     "north" | "south" | "east" | "west" (north is −Z), or the wall's number in `room.footprint`
 *              for a room where two walls face the same way or one runs at an angle
 * - `along`    where along the wall, 0 (its left end, seen from inside the room) to 1; default 0.5
 * - `distance` the same in metres from the left end; give one of the two
 * - `height`   the origin's y; default 0, the floor
 * - `offset`   metres out from the wall into the room; default 0
 * - `turn`     extra yaw in degrees; default 0 faces straight into the room
 *
 * A wall object (frame, door, screen) lands on the wall surface. Any other object is set with its back
 * against the wall, using the size its prefab declares (`geometry`, src/prefabs/registry.js).
 */

const tidy = v => { const n = Math.round(v * 1000) / 1000; return Object.is(n, -0) ? 0 : n; };

/** Degrees brought into −180 < d ≤ 180, rounded to 0.1. */
const wrap = d => { const v = Math.round((((d + 180) % 360 + 360) % 360 - 180) * 10) / 10; return v === -180 ? 180 : Object.is(v, -0) ? 0 : v; };

/** The yaw (degrees) that turns a prefab's front into the room from this wall. */
export const wallYaw = (wall, front = '+z') => wrap((Math.atan2(wall.normal[0], wall.normal[1]) * 180) / Math.PI + (front === '-z' ? 180 : 0));

/** The wall an `at.wall` names, or `{ error }` saying why it names none. */
export function findWall(wallList, name) {
  if (typeof name === 'number') {
    return wallList[name] ? { wall: wallList[name] } : { error: `no wall ${name} (this room has edges 0–${wallList.length - 1})` };
  }
  const hits = wallList.filter(w => w.compass === name);
  if (hits.length === 1) return { wall: hits[0] };
  if (!hits.length) return { error: `this room has no ${name} wall (it has: ${wallList.map(w => w.name).join(', ')}); give the edge index` };
  return { error: `"${name}" names ${hits.length} walls of this room (edges ${hits.map(w => w.index).join(' and ')}); give the edge index` };
}

/**
 * The object with `position` and `rotation` worked out from its `at`; an object without `at` is returned as is.
 * `at` stays on the result, so tools can say how the object was placed. A value that cannot be resolved is
 * reported through `fail(path, message)`, `path` being relative to the object (`at.wall`).
 */
export function resolvePlacement(obj, room, registry, fail) {
  const at = obj.at;
  if (!at) return obj;
  const found = findWall(walls(room.footprint), at.wall);
  if (found.error) { fail('at.wall', found.error); return obj; }
  const { wall } = found;
  if (at.distance != null && at.distance > wall.length + 1e-6) { fail('at.distance', `${at.distance} is past the end of the wall (${tidy(wall.length)} m long)`); return obj; }
  const d = at.distance ?? (at.along ?? 0.5) * wall.length;
  let g = null;
  try { g = registry.get(obj.type)?.geometry?.(obj.props) ?? null; } catch { /* no size: placed by its origin */ }
  const sz = Array.isArray(obj.scale) ? obj.scale[2] : obj.scale;
  const back = g && g.mount !== 'wall' ? (g.front === '-z' ? g.max[2] : -g.min[2]) * sz : 0;
  const out = at.offset + back;
  return {
    ...obj,
    position: [tidy(wall.left[0] + wall.right[0] * d + wall.normal[0] * out), at.height, tidy(wall.left[1] + wall.right[1] * d + wall.normal[1] * out)],
    rotation: [0, wrap(wallYaw(wall, g?.front) + at.turn), 0],
  };
}

/** How an `at` reads in words: "north wall, 40% along, 1.5 m up". */
export function placementText(at) {
  const wall = typeof at.wall === 'number' ? `wall ${at.wall}` : `${at.wall} wall`;
  const where = at.distance != null ? `${at.distance} m from its left end` : `${Math.round((at.along ?? 0.5) * 100)}% along`;
  return [wall, where, at.height ? `${at.height} m up` : null, at.offset ? `${at.offset} m out` : null, at.turn ? `turned ${at.turn}°` : null].filter(Boolean).join(', ');
}
