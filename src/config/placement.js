import { corners, walls } from '../lib/footprint.js';

/**
 * Placement by words instead of coordinates. An object may say where it stands with `at`, in place of `position`
 * and `rotation`, and which way it looks with `facing`, in place of `rotation`; the loader works the numbers out
 * here, before anything renders.
 *
 * `at` takes one of four forms:
 * - `{ wall, along | distance, height, offset, turn }`  on or against a wall. `wall` is "north" | "south" | "east" |
 *   "west" (north is −Z) or the wall's number in `room.footprint`; `along` is 0 (the wall's left end, seen from
 *   inside) to 1, default 0.5, and `distance` the same in metres; `offset` is metres out from the wall; `turn` is
 *   extra yaw in degrees.
 * - `{ corner, inset }`       in a corner, `inset` metres from both walls. `corner` is "north-east" … or the
 *   vertex's number in `room.footprint`. It faces diagonally into the room unless `facing` says otherwise.
 * - `{ centre: true, shift }` in the middle of the floor, `shift` = [east, south] metres from it.
 * - `{ near, side, gap }`     next to the object named `near`: `side` is "left" | "right" | "front" | "behind"
 *   (of that object, as someone standing in front of it sees it) or a compass side; `gap` metres between the two.
 *   It faces the way that object does unless `facing` says otherwise.
 * `height` is the origin's y in every form.
 *
 * `facing` is a compass direction (eight of them), "centre" (the middle of the room) or another object's name.
 * It turns the prefab's front there, whichever local axis that front is (`geometry().front`).
 *
 * A wall object (frame, door, screen) lands on the wall surface. Any other object is set with its outline
 * touching the wall, using the size its prefab declares (`geometry`, src/prefabs/registry.js). Objects refer to
 * each other by `name` only: indexes and types change when a scene is edited.
 */

const tidy = v => { const n = Math.round(v * 1000) / 1000; return Object.is(n, -0) ? 0 : n; };

/** Degrees brought into −180 < d ≤ 180, rounded to 0.1. */
const wrap = d => { const v = Math.round((((d + 180) % 360 + 360) % 360 - 180) * 10) / 10; return v === -180 ? 180 : Object.is(v, -0) ? 0 : v; };

const S = Math.SQRT1_2;
/** Unit floor vectors [x, z] of the compass directions; north is −Z, east is +X. */
export const DIRECTIONS = {
  north: [0, -1], 'north-east': [S, -S], east: [1, 0], 'south-east': [S, S],
  south: [0, 1], 'south-west': [-S, S], west: [-1, 0], 'north-west': [-S, -S],
};
export const CORNER_NAMES = ['north-east', 'south-east', 'south-west', 'north-west'];
export const SIDES = ['left', 'right', 'front', 'behind', 'north', 'south', 'east', 'west'];
/** What `facing` means when it is not an object's name. */
export const isDirection = f => f === 'centre' || Object.hasOwn(DIRECTIONS, f);

/** The yaw (degrees) that points a prefab's front along a floor direction [x, z]. */
export const yawTowards = ([x, z], front = '+z') => wrap((Math.atan2(x, z) * 180) / Math.PI + (front === '-z' ? 180 : 0));

/** The yaw (degrees) that turns a prefab's front into the room from this wall. */
export const wallYaw = (wall, front = '+z') => yawTowards(wall.normal, front);

/** The floor direction a prefab's front points in at a yaw. */
const frontAt = (yaw, front = '+z') => { const t = (yaw * Math.PI) / 180, k = front === '-z' ? -1 : 1; return [Math.sin(t) * k, Math.cos(t) * k]; };

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

/** The corner an `at.corner` names, or `{ error }`. `total` is the number of vertices in the footprint. */
export function findCorner(cornerList, name, total) {
  if (typeof name === 'number') {
    const hit = cornerList.find(c => c.index === name);
    if (hit) return { corner: hit };
    return { error: name < total ? `corner ${name} is an inner corner, nothing can stand in it (the corners are: ${cornerList.map(c => c.name).join(', ')})` : `no corner ${name} (this room has vertices 0–${total - 1})` };
  }
  const hits = cornerList.filter(c => c.compass === name);
  if (hits.length === 1) return { corner: hits[0] };
  if (!hits.length) return { error: `this room has no ${name} corner (it has: ${cornerList.map(c => c.name).join(', ')}); give the vertex number` };
  return { error: `"${name}" names ${hits.length} corners of this room (vertices ${hits.map(c => c.index).join(' and ')}); give the vertex number` };
}

function boxOf(obj, registry) {
  try { return registry.get(obj.type)?.geometry?.(obj.props) ?? null; } catch { return null; /* no size: placed by its origin */ }
}

/**
 * An object's floor outline at a yaw, relative to its origin: `{ pts, centre, radius }`. A round object is its
 * centre and radius; one without a declared size is a point at its origin. Matches `objectBox` in src/lint/geometry.js.
 */
function outline(g, scale, yaw) {
  if (!g) return { pts: [[0, 0]], centre: [0, 0], radius: 0 };
  const [sx, , sz] = Array.isArray(scale) ? scale : [scale, scale, scale];
  const t = (yaw * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const at = (x, z) => [x * sx * c + z * sz * s, -x * sx * s + z * sz * c];
  const centre = at((g.min[0] + g.max[0]) / 2, (g.min[2] + g.max[2]) / 2);
  if (g.round) return { pts: [centre], centre, radius: ((g.max[0] - g.min[0]) / 2) * Math.max(sx, sz) };
  return { pts: [at(g.min[0], g.min[2]), at(g.max[0], g.min[2]), at(g.max[0], g.max[2]), at(g.min[0], g.max[2])], centre, radius: 0 };
}

/** How far an outline reaches from its origin along a unit direction. */
const reach = (o, [dx, dz]) => Math.max(...o.pts.map(([x, z]) => x * dx + z * dz)) + o.radius;
const neg = ([x, z]) => [-x, -z];

/** The unit direction an `at.side` means next to an anchor that faces `front` (a unit [x, z]). */
function sideDirection(side, front) {
  if (Object.hasOwn(DIRECTIONS, side)) return DIRECTIONS[side];
  // left and right as someone standing in front of the object, looking at it, sees them
  const right = [front[1], -front[0]];
  return side === 'front' ? front : side === 'behind' ? neg(front) : side === 'right' ? right : neg(right);
}

/**
 * What one object's `at` asks for, checked against the room: `{ yaw(anchor), spot(yaw, anchor) }`, or null after
 * reporting why not through `fail`. `anchor` is the placed state of the object a `near` names.
 */
function plan(obj, g, room, wallList, cornerList, fail) {
  const at = obj.at, scale = obj.scale;
  if (!at) return { yaw: () => obj.rotation[1], spot: () => obj.position };

  if (at.wall != null) {
    const found = findWall(wallList, at.wall);
    if (found.error) { fail('at.wall', found.error); return null; }
    const { wall } = found;
    if (at.distance != null && at.distance > wall.length + 1e-6) { fail('at.distance', `${at.distance} is past the end of the wall (${tidy(wall.length)} m long)`); return null; }
    const d = at.distance ?? (at.along ?? 0.5) * wall.length;
    return {
      yaw: () => wrap(wallYaw(wall, g?.front) + at.turn),
      spot: yaw => {
        // a wall object's origin is on the wall; anything else stands with its outline touching it
        const out = at.offset + (g && g.mount !== 'wall' ? reach(outline(g, scale, yaw), neg(wall.normal)) : 0);
        return [wall.left[0] + wall.right[0] * d + wall.normal[0] * out, at.height, wall.left[1] + wall.right[1] * d + wall.normal[1] * out];
      },
    };
  }

  if (at.corner != null) {
    const found = findCorner(cornerList, at.corner, room.footprint.length);
    if (found.error) { fail('at.corner', found.error); return null; }
    const { point: v, walls: [a, b] } = found.corner;
    const into = [a.normal[0] + b.normal[0], a.normal[1] + b.normal[1]];
    return {
      yaw: () => yawTowards(into, g?.front),
      spot: yaw => {
        // the point where the outline is `inset` from both walls: two lines, one crossing
        const o = outline(g, scale, yaw);
        const ra = at.inset + v[0] * a.normal[0] + v[1] * a.normal[1] + reach(o, neg(a.normal));
        const rb = at.inset + v[0] * b.normal[0] + v[1] * b.normal[1] + reach(o, neg(b.normal));
        const det = a.normal[0] * b.normal[1] - a.normal[1] * b.normal[0];
        return [(ra * b.normal[1] - rb * a.normal[1]) / det, at.height, (a.normal[0] * rb - b.normal[0] * ra) / det];
      },
    };
  }

  if (at.centre) {
    return {
      yaw: () => yawTowards(DIRECTIONS.south, g?.front),
      spot: () => [room.centre[0] + at.shift[0], at.height, room.centre[1] + at.shift[1]],
    };
  }

  // next to another object
  return {
    yaw: anchor => yawTowards(frontAt(anchor.yaw, anchor.g?.front), g?.front),
    spot: (yaw, anchor) => {
      const d = sideDirection(at.side, frontAt(anchor.yaw, anchor.g?.front)), across = [-d[1], d[0]];
      const own = outline(g, scale, yaw), other = outline(anchor.g, anchor.scale, anchor.yaw);
      const [ax, ay, az] = anchor.position;
      const along = ax * d[0] + az * d[1] + reach(other, d) + at.gap + reach(own, neg(d));
      // side by side their centres line up; two wall objects keep their origins in line, so both stay on the wall
      const onWall = g?.mount === 'wall';
      const line = onWall ? ax * across[0] + az * across[1]
        : (ax + other.centre[0]) * across[0] + (az + other.centre[1]) * across[1] - (own.centre[0] * across[0] + own.centre[1] * across[1]);
      const sy = Array.isArray(scale) ? scale[1] : scale;
      const y = at.height ?? (!g || g.mount === 'floor' ? 0 : g.mount === 'free' ? -g.min[1] * sy : ay);
      return [along * d[0] + line * across[0], y, along * d[1] + line * across[1]];
    },
  };
}

/**
 * Places every object of a scene. `entries` are `{ obj, fail }` in file order (the scenery, then each stop's
 * objects); `fail(path, message)` reports a value that cannot be resolved, `path` relative to the object
 * (`at.wall`, `facing`). Returns the objects in the same order: one with `at` or `facing` gets its `position` and
 * `rotation` (`at` and `facing` stay on it, so tools can say how it was placed), one that could not be placed gets
 * `unplaced: true`, and any other is returned as it is.
 *
 * Position and rotation are worked out separately and in rounds, so two objects may face each other and an object
 * may stand next to one thing while facing another. Objects that stand next to each other in a circle cannot be
 * placed and are reported.
 */
export function placeAll(entries, room, registry) {
  const out = entries.map(e => e.obj);
  if (!entries.some(e => e.obj.at || e.obj.facing != null)) return out;
  const wallList = walls(room.footprint), cornerList = corners(room.footprint);
  const n = entries.length;
  const failed = new Array(n).fill(false);
  const fail = (i, path, msg) => { failed[i] = true; entries[i].fail(path, msg); };

  const byName = new Map();
  entries.forEach(({ obj }, i) => { if (typeof obj.name === 'string' && obj.name) byName.set(obj.name, [...(byName.get(obj.name) ?? []), i]); });
  const known = byName.size ? `named objects: ${[...byName.keys()].join(', ')}` : 'no object in this scene has a "name"; give one to the object you mean';
  const refer = (i, name, path) => {
    const hits = byName.get(name) ?? [];
    if (hits.length === 1 && hits[0] !== i) return hits[0];
    fail(i, path, hits.length > 1 ? `"${name}" names ${hits.length} objects; a name that is referred to must be unique`
      : hits.length ? `"${name}" is this object itself` : `no object is named "${name}" (${known})`);
    return null;
  };

  const boxes = entries.map(e => boxOf(e.obj, registry));
  const anchor = new Array(n).fill(null), target = new Array(n).fill(null), plans = new Array(n).fill(null);
  entries.forEach(({ obj }, i) => {
    if (obj.at?.near != null) anchor[i] = refer(i, obj.at.near, 'at.near');
    if (obj.facing != null && !isDirection(obj.facing)) target[i] = refer(i, obj.facing, 'facing');
    if (!failed[i]) plans[i] = plan(obj, boxes[i], room, wallList, cornerList, (path, msg) => fail(i, path, msg));
  });

  // objects next to others come after them; a circle of them cannot be placed
  const order = [], mark = new Array(n).fill(0);
  const visit = (i, trail) => {
    if (mark[i] === 2) return;
    if (mark[i] === 1) {
      const loop = trail.slice(trail.indexOf(i));
      const names = [...loop, i].map(k => `"${entries[k].obj.name}"`).join(' → ');
      for (const k of loop) if (!failed[k]) fail(k, 'at.near', `these objects stand next to each other in a circle: ${names}; give one of them a position`);
      return;
    }
    mark[i] = 1;
    if (anchor[i] != null) visit(anchor[i], [...trail, i]);
    mark[i] = 2;
    order.push(i);
  };
  for (let i = 0; i < n; i++) visit(i, []);

  // round 1 turns everything its default way; later rounds aim `facing` at where the last round put its target
  const aimed = entries.some(e => e.obj.facing === 'centre') || target.some(t => t != null);
  let prev = null, state = null;
  for (let round = 0; round < (aimed ? 3 : 1); round++) {
    state = new Array(n).fill(null);
    for (const i of order) {
      const { obj } = entries[i], g = boxes[i];
      // what it leans on was not placed: say nothing more, the reason is already reported
      if (!failed[i] && ((anchor[i] != null && !state[anchor[i]]) || (target[i] != null && failed[target[i]]))) failed[i] = true;
      if (failed[i]) continue;
      const a = anchor[i] != null ? state[anchor[i]] : null;
      let yaw = plans[i].yaw(a);
      if (Object.hasOwn(DIRECTIONS, obj.facing ?? '')) yaw = yawTowards(DIRECTIONS[obj.facing], g?.front);
      else if (obj.facing != null && prev?.[i]) {
        const me = prev[i], to = target[i] != null ? prev[target[i]] : null;
        const from = outline(g, obj.scale, me.yaw).centre;
        const aim = to ? [to.position[0] + outline(to.g, to.scale, to.yaw).centre[0], to.position[2] + outline(to.g, to.scale, to.yaw).centre[1]] : room.centre;
        const dir = [aim[0] - me.position[0] - from[0], aim[1] - me.position[2] - from[1]];
        if (Math.hypot(...dir) > 1e-6) yaw = yawTowards(dir, g?.front);
      }
      state[i] = { position: plans[i].spot(yaw, a), yaw, g, scale: obj.scale };
    }
    prev = state;
  }

  entries.forEach(({ obj }, i) => {
    if (failed[i]) out[i] = { ...obj, unplaced: true };
    else if (obj.at || obj.facing != null) {
      const [x, y, z] = state[i].position;
      out[i] = { ...obj, position: obj.at ? [tidy(x), y, tidy(z)] : obj.position, rotation: [0, wrap(state[i].yaw), 0] };
    }
  });
  return out;
}

/** One object placed on its own (it cannot refer to others); an object without `at` and `facing` is returned as is. */
export const resolvePlacement = (obj, room, registry, fail) => placeAll([{ obj, fail }], room, registry)[0];

const SIDE_WORDS = { left: 'to the left of', right: 'to the right of', front: 'in front of', behind: 'behind', north: 'north of', south: 'south of', east: 'east of', west: 'west of' };

/** How an `at` reads in words: "north wall, 40% along, 1.5 m up". */
export function placementText(at) {
  const up = at.height ? `${at.height} m up` : null;
  let parts;
  if (at.wall != null) {
    const wall = typeof at.wall === 'number' ? `wall ${at.wall}` : `${at.wall} wall`;
    const where = at.distance != null ? `${at.distance} m from its left end` : `${Math.round((at.along ?? 0.5) * 100)}% along`;
    parts = [wall, where, up, at.offset ? `${at.offset} m out` : null, at.turn ? `turned ${at.turn}°` : null];
  } else if (at.corner != null) {
    parts = [typeof at.corner === 'number' ? `corner ${at.corner}` : `${at.corner} corner`, at.inset ? `${at.inset} m in` : null, up];
  } else if (at.centre) {
    const [dx, dz] = at.shift ?? [0, 0];
    const moved = [dx ? `${Math.abs(dx)} m ${dx > 0 ? 'east' : 'west'}` : null, dz ? `${Math.abs(dz)} m ${dz > 0 ? 'south' : 'north'}` : null].filter(Boolean);
    parts = ['the middle of the room', moved.length ? `moved ${moved.join(' and ')}` : null, up];
  } else if (at.near != null) {
    parts = [`${SIDE_WORDS[at.side ?? 'right']} "${at.near}"`, `${at.gap ?? 0.3} m apart`, up];
  } else parts = ['nowhere'];
  return parts.filter(Boolean).join(', ');
}

/** How a `facing` reads in words. */
export const facingText = f => (f === 'centre' ? 'the middle of the room' : Object.hasOwn(DIRECTIONS, f) ? f : `"${f}"`);
