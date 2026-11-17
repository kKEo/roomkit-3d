/**
 * Still mode: the viewer as a camera on a tripod. `?still` in the address shows the room and nothing else (no
 * fly-in, no panel, no overlays, no dust, no sway) from the view `?view=` names, and `window.__roomkit` lets a
 * script move that camera and wait until the picture has settled (src/ui/stillRig.js). It exists so that a script,
 * or a coding agent, can look at a scene: `node tools/scene.js shots <scene>` takes the pictures.
 *
 * This file is the part with no browser in it: reading the address and working out the poses.
 */

/** `{ view }` when the query string asks for still mode, else null. */
export function stillFrom(search) {
  const q = new URLSearchParams(search);
  return q.has('still') ? { view: q.get('view') || 'overview' } : null;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * A view as written: "overview" (the whole-room view, also when nothing is given), "top" (straight down, north
 * up), a pose "x,y,z,tx,ty,tz" (where the camera stands and what it looks at) or a stop's id. Null for a pose
 * that is not six numbers.
 */
export function parseView(text) {
  const t = String(text ?? '').trim();
  if (!t || t === 'overview') return { kind: 'overview' };
  if (t === 'top') return { kind: 'top' };
  const parts = t.split(',').map(p => p.trim());
  if (parts.length === 1) return { kind: 'stop', id: t };
  if (parts.length !== 6 || !parts.every(p => NUMBER.test(p))) return null;
  const n = parts.map(Number);
  return { kind: 'pose', position: n.slice(0, 3), target: n.slice(3) };
}

/**
 * The view from above that takes in the whole floor plan: over the middle of the room's bounds, as far above the
 * ceiling as it takes for the tops of the walls, the nearest thing to the camera, to fit a picture of that `aspect`
 * (the shell is drawn from inside only, so from above one looks in). It stands a hair south of straight down, which
 * keeps north at the top.
 */
export function topView(room, fov = 55, aspect = 16 / 9) {
  const tan = Math.tan((fov * Math.PI) / 360), b = room.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const above = Math.max(2, (room.depth * 1.08) / (2 * tan), (room.width * 1.08) / (2 * tan * aspect));
  return { position: [cx, Math.ceil((room.height + above) * 10) / 10, cz + 0.01], target: [cx, 0, cz] };
}

/**
 * A list of views as written on a command line, "overview,studio,0,3,-3,0,3,-12": split at the commas, except that
 * six numbers in a row are one pose.
 */
export function splitViews(text) {
  const parts = String(text ?? '').split(',').map(p => p.trim()), out = [];
  for (let i = 0; i < parts.length;) {
    const six = parts.slice(i, i + 6);
    if (six.length === 6 && six.every(p => NUMBER.test(p))) { out.push(six.join(',')); i += 6; } else { if (parts[i]) out.push(parts[i]); i++; }
  }
  return out;
}

/** The names a scene's views go by: the two of the room, then each stop's id. */
export const viewNames = pois => ['overview', 'top', ...pois.map(p => p.id)];

/** The camera pose a view means in a built scene: `{ position, target }`, or `{ error }` saying what the views are. */
export function viewPose(text, scene, pois, aspect = 16 / 9) {
  const v = parseView(text);
  if (!v) return { error: `"${text}" is not a view: write overview, top, a stop's id, or a pose as x,y,z,tx,ty,tz` };
  if (v.kind === 'pose') return { position: v.position, target: v.target };
  if (v.kind === 'overview') return { position: scene.camera.overview.position, target: scene.camera.overview.target };
  if (v.kind === 'top') return topView(scene.room, scene.camera.fov, aspect);
  const poi = pois.find(p => p.id === v.id);
  return poi ? { position: poi.camera.position, target: poi.camera.target } : { error: `no stop has the id "${v.id}" (views: ${viewNames(pois).join(', ')})` };
}

/**
 * How a contact sheet of `n` pictures is laid out: `{ cols, rows, width }`, `width` being the sheet's in CSS pixels.
 * Up to four pictures keep their size, two to a row; more go three to a row on a sheet no wider than 1600 px,
 * about what a model reading the picture takes in without shrinking it.
 */
export function sheetLayout(n, [w] = [640, 360]) {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(n / cols), width: Math.min(cols * w, 1600) };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The contact sheet as a page: each frame `{ label, png }` (`png` base64) with its label over the picture's corner. */
export function sheetHtml(title, frames, size = [640, 360]) {
  const { cols, width } = sheetLayout(frames.length, size);
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { margin: 0; background: #000; font: 14px/1.2 ui-monospace, Menlo, Consolas, monospace; width: ${width}px }
  main { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 2px }
  figure { margin: 0; position: relative; aspect-ratio: ${size[0]} / ${size[1]}; background: #111 }
  img { display: block; width: 100%; height: 100% }
  figcaption { position: absolute; left: 0; top: 0; padding: 3px 7px; background: rgba(0,0,0,.78); color: #fff }
</style>
<main>${frames.map(f => `<figure><img src="data:image/png;base64,${f.png}" alt=""><figcaption>${esc(f.label)}</figcaption></figure>`).join('')}</main>`;
}
