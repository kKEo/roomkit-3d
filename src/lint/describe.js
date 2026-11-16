import { z } from 'zod';
import { alongWall, distToSegment, nearestWall, walls } from '../lib/footprint.js';
import { framing, objectBox, penetration, sceneObjects } from './geometry.js';
import { TYPE_INFO } from '../editor/types.js';
import { placementText, facingText } from '../config/placement.js';

/**
 * A scene read back in words, from the built config alone: where every object stands relative to the walls and
 * to its neighbours, and what each POI's camera sees. Meant to be compared with the description a scene was
 * built from: if the brief says "a desk by the east wall facing the door" and this says the desk faces a wall,
 * the scene is wrong, and no browser was needed to find out. Deterministic, so it can be diffed.
 */

const n = v => String(Math.round(v * 10) / 10);
const pt = a => `[${a.map(n).join(', ')}]`;

const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
/** The compass direction of a floor vector; north is −Z, east is +X. */
export const compass = ([x, z]) => DIRS[((Math.round((Math.atan2(x, z) * 4) / Math.PI) % 8) + 8) % 8];

/** The gap between two outlines in metres; 0 when they touch or overlap. */
export function gap(a, b) {
  if (penetration(a, b) > 0) return 0;
  let best = Infinity;
  for (const [p, q] of [[a, b], [b, a]]) for (const [x, zz] of p) for (let i = 0; i < q.length; i++) best = Math.min(best, distToSegment(x, zz, q[i], q[(i + 1) % q.length]));
  return best;
}

const span = (poly, i) => Math.max(...poly.map(p => p[i])) - Math.min(...poly.map(p => p[i]));
const name = e => `${e.obj.name ?? e.obj.type} (${e.key})`;

function actionText([hotspot, a]) {
  const what = a.type === 'goTo' ? `goes to ${a.poi ?? 'the overview'}` : a.type === 'zoom' ? `zooms into ${a.screen ?? 'its screen'}${a.poi ? ` of ${a.poi}` : ''}`
    : a.type === 'openUrl' ? `opens ${a.url}` : a.type;
  return `${hotspot} ${what}`;
}

function objectLine(e, others, wallList) {
  const { box, obj } = e;
  if (!box) return `${name(e)}: at ${pt(obj.position)}, rotation ${pt(obj.rotation)}; size not known`;
  const parts = [];
  if (box.mount === 'wall') {
    const near = nearestWall(wallList, ...box.origin);
    const where = near.distance <= 0.05 ? `on the ${near.wall.name}` : `${n(near.distance)} m off the ${near.wall.name}`;
    parts.push(`${where}, ${n(alongWall(near.wall, ...box.origin))} m from its left end of ${n(near.wall.length)} m`, `from y ${n(box.y0)} to ${n(box.y1)}`, `${n(box.local.max[0] - box.local.min[0])} m wide`, `facing ${compass(box.front)}`);
  } else {
    parts.push(`${box.mount === 'floor' ? 'on the floor' : box.mount === 'ceiling' ? 'under the ceiling' : 'placed'} at ${pt(obj.position)}`,
      `${n(span(box.poly, 0))} m east–west by ${n(span(box.poly, 1))} m north–south${box.round ? ' (round)' : ''}, y ${n(box.y0)} to ${n(box.y1)}`, `facing ${compass(box.front)}`);
    const near = wallList.map(w => ({ w, d: gap(box.poly, [w.a, w.b]) })).sort((p, q) => p.d - q.d)[0];
    parts.push(near.d <= 0.05 ? `against the ${near.w.name}` : `${n(near.d)} m from the ${near.w.name}`);
  }
  const next = others.filter(o => o !== e && o.box).map(o => ({ o, d: gap(box.poly, o.box.poly) })).sort((p, q) => p.d - q.d)[0];
  if (next) parts.push(`nearest: ${name(next.o)}, ${next.d <= 0.05 ? 'touching' : `${n(next.d)} m ${compass([next.o.box.centre[0] - box.centre[0], next.o.box.centre[1] - box.centre[1]])}`}`);
  if (obj.at) parts.push(`placed at: ${placementText(obj.at)}`);
  if (obj.facing != null) parts.push(`turned to face: ${facingText(obj.facing)}`);
  const actions = Object.entries(obj.actions);
  if (actions.length) parts.push(`click: ${actions.map(actionText).join(', ')}`);
  return `${name(e)}: ${parts.join('; ')}`;
}

function cameraLines(poi, scene, all) {
  const { position, target } = poi.camera;
  const dist = Math.hypot(...position.map((v, i) => v - target[i]));
  const look = compass([target[0] - position[0], target[2] - position[2]]);
  const seen = all.filter(e => e.box).map(e => ({ e, f: framing(poi.camera, scene.camera.fov, e.box) }))
    .filter(v => v.f.visible && v.f.cover >= 0.01).sort((a, b) => b.f.cover - a.f.cover).slice(0, 6);
  const side = c => (c[0] < -0.33 ? 'left' : c[0] > 0.33 ? 'right' : 'centre');
  const own = seen.filter(v => v.e.owner === poi.id).length;
  return [
    `  camera at ${pt(position)} looking ${look} at ${pt(target)}, ${n(dist)} m away, ${scene.camera.fov}° tall view`,
    `  in the picture: ${seen.length ? seen.map(v => `${name(v.e)} ${Math.round(v.f.cover * 100)}% ${side(v.f.centre)}${v.f.cut ? ' (cut off)' : ''}`).join(', ') : 'nothing'}`,
    ...(own ? [] : ['  NOTE: none of this stop\'s own objects fills 1% of the picture']),
  ];
}

/** The read-back as lines of text; `brief` is the description the scene was built from (its `brief.json › text`), printed first. */
export function describeScene(scene, pois, { brief = null } = {}) {
  const { room } = scene, wallList = walls(room.footprint);
  const all = sceneObjects(scene, pois).map(e => ({ ...e, box: objectBox(e.obj, scene.registry) }));
  const out = [
    `${scene.name}: "${scene.title}"`,
    ...(brief ? [`brief: ${brief}`] : []),
    `room: ${n(room.width)} m east–west by ${n(room.depth)} m north–south, ${n(room.height)} m high; x grows east, z grows south, y is up, the floor is y 0`,
    `walls: ${wallList.map(w => `${w.name} ${n(w.length)} m`).join(', ')}`,
    `pillars: ${room.pillars.length ? room.pillars.map(pt).join(' ') : 'none'}; lights: ${room.lights.length}`,
    '',
    `decor, ${scene.decor.length} objects that belong to no stop:`,
    ...all.filter(e => !e.owner).map(e => `  ${objectLine(e, all, wallList)}`),
  ];
  pois.forEach((p, i) => {
    out.push('', `stop ${i + 1} "${p.id}" (${p.file}): ${p.label}`);
    out.push(...all.filter(e => e.owner === p.id).map(e => `  ${objectLine(e, all, wallList)}`));
    out.push(...cameraLines(p, scene, all));
  });
  return out;
}

const fmtDefault = v => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.length} items]` : v && typeof v === 'object' ? '{…}' : String(v));

function propText(key, s, def) {
  const kind = a => (a.enum ? a.enum.map(v => JSON.stringify(v)).join(' | ') : [a.type ?? 'any'].flat().join(' | '));
  const type = s.anyOf ? [...new Set(s.anyOf.map(kind))].join(' | ') : kind(s);
  const range = [s.minimum != null && `≥ ${s.minimum}`, s.exclusiveMinimum != null && `> ${s.exclusiveMinimum}`, s.maximum != null && s.maximum < Number.MAX_SAFE_INTEGER && `≤ ${s.maximum}`].filter(Boolean).join(', ');
  return `${key}: ${type}${range ? ` (${range})` : ''} = ${fmtDefault(def)}${s.description ? ` [${s.description}]` : ''}`;
}

/**
 * The prefab types a scene can place, read from the registry: what each is, where its origin sits, which way it
 * faces, how big it is with default props, its props with their defaults and limits, and its clickable parts.
 */
export function describePrefabs(registry) {
  const out = [];
  for (const [type, entry] of registry.entries()) {
    const g = entry.geometry?.(entry.props);
    const blurb = TYPE_INFO[type]?.[1] ?? entry.blurb ?? "this scene's own type";
    out.push(`${type}: ${blurb}`);
    if (g) {
      const origin = g.mount === 'wall' ? 'origin on the wall surface' : g.mount === 'floor' ? 'origin on the floor' : g.mount === 'ceiling' ? 'origin on the ceiling' : 'origin where the box says';
      const c = v => String(Math.round(v * 100) / 100);
      out.push(`  ${g.mount} object, ${origin}, faces ${g.front}; with default props ${c(g.max[0] - g.min[0])} wide × ${c(g.max[1] - g.min[1])} high × ${c(g.max[2] - g.min[2])} deep${g.round ? ' (round)' : ''}: x ${c(g.min[0])}…${c(g.max[0])}, y ${c(g.min[1])}…${c(g.max[1])}, z ${c(g.min[2])}…${c(g.max[2])}`);
    } else out.push('  size not declared: its position is not checked');
    let props = {};
    try { props = z.toJSONSchema(entry.schema, { io: 'input', unrepresentable: 'any' }).properties ?? {}; } catch { /* a schema zod cannot describe: list the defaults only */ }
    const keys = Object.keys(entry.props);
    out.push(`  props: ${keys.length ? keys.map(k => propText(k, props[k] ?? {}, entry.props[k])).join('; ') : 'none'}`);
    out.push(`  clickable parts: ${entry.hotspots(entry.props).join(', ') || 'none'}`);
  }
  return out;
}
