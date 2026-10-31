/**
 * Which screen of a POI the keyboard reaches next. Pure vector math on zoom records
 * (`{ key, center: [x, y, z], … }`) and the POI's camera (`{ position, target }`), no three.js.
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

/** The records sorted left to right as seen from the camera; screens stacked (closer than 0.5 m sideways) go top first. */
export function orderScreens(records, camera) {
  if (!camera) return [...records];
  const right = rightOf(camera);
  const x = rec => dot(sub(rec.center, camera.position), right);
  return [...records].sort((a, b) => {
    const dx = x(a) - x(b);
    return Math.abs(dx) < 0.5 ? b.center[1] - a.center[1] : dx;
  });
}

/** The record whose centre is nearest the camera's look target (what the visitor is facing), or null. */
export function nearestScreen(records, camera) {
  if (!records.length) return null;
  if (!camera) return records[0];
  let best = null, bestD = Infinity;
  for (const rec of records) {
    const d = len(sub(rec.center, camera.target));
    if (d < bestD) { best = rec; bestD = d; }
  }
  return best;
}

/** The record `dir` steps (±1, wrapping) from the one with `key` in camera order; null when there is nothing to move to. */
export function stepScreen(records, camera, key, dir) {
  const list = orderScreens(records, camera);
  if (list.length < 2) return null;
  const i = list.findIndex(r => r.key === key);
  if (i < 0) return list[0];
  return list[(i + dir + list.length) % list.length];
}
