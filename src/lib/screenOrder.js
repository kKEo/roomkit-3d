/**
 * Which screen of a POI the keyboard reaches: the screens as laid out on the wall, seen from the POI's
 * camera. Pure vector math on zoom records (`{ key, center: [x, y, z], h, … }`) and the camera
 * (`{ position, target }`), no three.js.
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);

/** Unit vector pointing right as seen from `camera`; falls back to world +x when the camera looks straight down. */
function rightOf(camera) {
  const f = sub(camera.target, camera.position);
  const r = [-f[2], 0, f[0]]; // f × up(0,1,0)
  const l = len(r);
  return l < 1e-6 ? [1, 0, 0] : [r[0] / l, 0, r[2] / l];
}

/** `rec → { x, y }`: where a record sits on the wall as seen from `camera` (x to the right, y up, in metres). */
function planeOf(camera) {
  const right = camera ? rightOf(camera) : [1, 0, 0];
  const origin = camera?.position ?? [0, 0, 0];
  return rec => ({ x: dot(sub(rec.center, origin), right), y: rec.center[1] });
}

/** Two records are in one row when their centres differ in height by less than half the smaller screen. */
const sameRow = (a, b) => Math.abs(a.center[1] - b.center[1]) < Math.max(0.25, Math.min(a.h ?? 1, b.h ?? 1) / 2);
/** …and in one column when they differ sideways (as seen from the camera) by less than half the narrower screen. */
const sameColumn = (a, b, at) => Math.abs(at(a).x - at(b).x) < Math.max(0.25, Math.min(a.w ?? 1, b.w ?? 1) / 2);

/** The records in reading order as seen from the camera: the top row first, each row left to right. */
export function orderScreens(records, camera) {
  const at = planeOf(camera);
  return [...records].sort((a, b) => (sameRow(a, b) ? at(a).x - at(b).x : b.center[1] - a.center[1]));
}

/** The screen a zoom starts with: the top-left one, or null without any. */
export const firstScreen = (records, camera) => orderScreens(records, camera)[0] ?? null;

export const DIRECTIONS = ['left', 'right', 'up', 'down'];
const VECTOR = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };

/**
 * The next record in direction `dir` ("left" | "right" | "up" | "down") from the one with `key`, on the
 * wall as seen from `camera`: the nearest screen of the same row (left/right) or the same column (up/down).
 * The end of a row or column has nowhere to go (null): no jumping rows, no wrapping. An unknown key starts
 * from the first screen.
 */
export function moveScreen(records, camera, key, dir) {
  const from = records.find(r => r.key === key);
  if (!from) return firstScreen(records, camera);
  const [dx, dy] = VECTOR[dir] ?? [0, 0];
  if (!dx && !dy) return null;
  const at = planeOf(camera);
  const o = at(from);
  let best = null, bestD = Infinity;
  for (const rec of records) {
    if (rec.key === from.key) continue;
    if (dx ? !sameRow(from, rec) : !sameColumn(from, rec, at)) continue;
    const p = at(rec);
    const along = (p.x - o.x) * dx + (p.y - o.y) * dy;
    if (along < 1e-3) continue;
    if (along < bestD) { best = rec; bestD = along; }
  }
  return best;
}
