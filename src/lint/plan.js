import { bounds, containsPoint, distToSegment } from '../lib/footprint.js';
import { objectBox, pillarPoly, sceneObjects } from './geometry.js';
import { wallPieces } from '../lib/walls.js';

/**
 * A scene's floor plan from the built config: as text, for a terminal or a coding agent, and as SVG, for people.
 * North (−Z) is up and east (+X) is right, the way the viewer's minimap draws the room.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function items(scene, pois) {
  return sceneObjects(scene, pois).map((e, i) => ({ ...e, box: objectBox(e.obj, scene.registry), letter: LETTERS[i % LETTERS.length] }));
}

/**
 * The plan as lines of text. A character is `step` metres wide and a line 2 × `step` metres tall, which looks
 * square in a terminal; `step` is 0.5 m unless the room is wider than `maxCols` characters.
 * `#` wall (interior walls too; a doorway is a gap), `.` floor, `o` pillar, a letter per object (see the legend), a digit where each stop's camera stands.
 */
export function planText(scene, pois, { maxCols = 96 } = {}) {
  const poly = scene.room.footprint, b = bounds(poly);
  const step = Math.max(0.5, Math.ceil((b.width / maxCols) * 2) / 2), row = step * 2;
  const cols = Math.ceil(b.width / step) + 2, rows = Math.ceil(b.depth / row) + 2;
  const xAt = c => b.minX + (c - 0.5) * step, zAt = r => b.minZ + (r - 0.5) * row;
  const colOf = x => Math.max(0, Math.min(cols - 1, Math.round((x - b.minX) / step + 0.5)));
  const rowOf = zz => Math.max(0, Math.min(rows - 1, Math.round((zz - b.minZ) / row + 0.5)));
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const x = xAt(c), zz = zAt(r);
    const onWall = poly.some((a, i) => { const q = poly[(i + 1) % poly.length]; return distToSegment(x, zz, a, q) <= (Math.abs(a[0] - q[0]) < 1e-6 ? step : row) * 0.5; });
    return onWall ? '#' : containsPoint(poly, x, zz) ? '.' : ' ';
  }));
  const fill = (shape, ch) => {
    let hit = false;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (containsPoint(shape, xAt(c), zAt(r))) { grid[r][c] = ch; hit = true; }
    return hit;
  };
  for (const pc of wallPieces(scene.room)) {
    if (pc.y0 > 0) continue; // a lintel: the doorway under it stays open
    // a thin wall can fall between the cells: mark the cells along its centre line too
    fill(pc.poly, '#');
    const steps = Math.ceil(pc.length / (step / 2));
    for (let k = 0; k <= steps; k++) grid[rowOf(pc.a[1] + ((pc.b[1] - pc.a[1]) * k) / steps)][colOf(pc.a[0] + ((pc.b[0] - pc.a[0]) * k) / steps)] = '#';
  }
  for (const p of scene.room.pillars) if (!fill(pillarPoly(p), 'o')) grid[rowOf(p[1])][colOf(p[0])] = 'o';
  const list = items(scene, pois);
  for (const it of list) {
    const [x, zz] = it.box ? it.box.centre : [it.obj.position[0], it.obj.position[2]];
    if (!it.box || !fill(it.box.poly, it.letter)) grid[rowOf(zz)][colOf(x)] = it.letter;
  }
  pois.forEach((p, i) => { grid[rowOf(p.camera.position[2])][colOf(p.camera.position[0])] = String((i + 1) % 10); });
  const drawn = new Set(grid.flat());
  return [
    `${scene.name}: north is up, east is right; one character is ${step} m wide, one line ${row} m`,
    ...grid.map(r => r.join('').replace(/\s+$/, '')),
    '',
    ...list.map(it => `${it.letter}  ${it.obj.name ?? it.obj.type} (${it.key})${drawn.has(it.letter) ? '' : ' — not drawn: a camera number or another object covers it'}`),
    ...pois.map((p, i) => `${(i + 1) % 10}  camera of stop "${p.id}"`),
    '#  wall   .  floor   o  pillar',
  ];
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The plan as an SVG document: walls, pillars, each object's outline with its key, each stop's camera and sight line. */
export function planSvg(scene, pois, { scale = 24, pad = 2 } = {}) {
  const poly = scene.room.footprint, b = bounds(poly);
  const X = x => ((x - b.minX + pad) * scale).toFixed(1), Y = zz => ((zz - b.minZ + pad) * scale).toFixed(1);
  const pts = p => p.map(([x, zz]) => `${X(x)},${Y(zz)}`).join(' ');
  const w = (b.width + pad * 2) * scale, h = (b.depth + pad * 2) * scale;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="monospace" font-size="${scale * 0.45}">`,
    `<title>${esc(scene.title)}: floor plan, north up</title>`,
    `<rect width="100%" height="100%" fill="#0b0f0c"/>`,
    `<polygon points="${pts(poly)}" fill="#101a13" stroke="#39d98a" stroke-width="3"/>`,
    ...wallPieces(scene.room).map(pc => `<polygon points="${pts(pc.poly)}" fill="#39d98a" fill-opacity="${pc.y0 > 0 ? '.2' : '.8'}" stroke="#39d98a"/>`),
    ...scene.room.pillars.map(p => `<polygon points="${pts(pillarPoly(p))}" fill="#39d98a" fill-opacity=".5"/>`),
  ];
  for (const it of items(scene, pois)) {
    const [x, zz] = it.box ? it.box.centre : [it.obj.position[0], it.obj.position[2]];
    if (it.box) {
      out.push(`<polygon points="${pts(it.box.poly)}" fill="${it.owner ? '#39d98a' : '#8aa'}" fill-opacity=".25" stroke="${it.owner ? '#39d98a' : '#8aa'}"/>`);
      out.push(`<line x1="${X(x)}" y1="${Y(zz)}" x2="${X(x + it.box.front[0] * 0.8)}" y2="${Y(zz + it.box.front[1] * 0.8)}" stroke="#fff"/>`);
    } else out.push(`<circle cx="${X(x)}" cy="${Y(zz)}" r="4" fill="#8aa"/>`);
    out.push(`<text x="${X(x)}" y="${Y(zz)}" dy="-4" fill="#e8fff2" text-anchor="middle">${esc(it.key)} ${esc(it.obj.name ?? it.obj.type)}</text>`);
  }
  pois.forEach((p, i) => {
    const [cx, , cz] = p.camera.position, [tx, , tz] = p.camera.target;
    out.push(`<line x1="${X(cx)}" y1="${Y(cz)}" x2="${X(tx)}" y2="${Y(tz)}" stroke="#ffd166" stroke-dasharray="4 4"/>`);
    out.push(`<circle cx="${X(cx)}" cy="${Y(cz)}" r="${scale * 0.3}" fill="#ffd166"/><text x="${X(cx)}" y="${Y(cz)}" dy="${scale * 0.15}" text-anchor="middle" fill="#000">${i + 1}</text>`);
  });
  out.push(`<text x="${w / 2}" y="${scale}" fill="#39d98a" text-anchor="middle">N ↑  ${esc(scene.name)}  (${b.width} × ${b.depth} m)</text>`, '</svg>');
  return out.join('\n');
}
