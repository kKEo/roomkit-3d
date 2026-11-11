import { insideOrNear, nearestWall, walls, bounds } from '../lib/footprint.js';
import { BLOCK_DATA, FEED_BLOCKS, feedBlockSchema, parseBlockData } from '../ui/blocks/schema.js';
import { sceneRefs } from '../editor/export.js';
import { wallYaw } from '../config/placement.js';
import { PILLAR_HALF, objectBox, penetration, pillarPoly, pointInBox, sceneObjects, segmentHitsBox } from './geometry.js';

/**
 * The scene checks behind `node tools/scene.js check`: everything a scene can get wrong that the loader does
 * not refuse. Each finding is `{ level, code, file, path, message, hint }`, where `level` is 'error' (the scene
 * is broken for a visitor), 'warn' (it loads but something is very likely not what the author meant) or 'info'.
 * `file › path` is written the way config errors are, so a finding points at the line to edit.
 *
 * Pure: the caller hands in what `inspectScene` returned plus the folder's text files, so it runs in Node,
 * in the test suite and in an editor alike.
 */

/** Slack for "on the wall" and "touching", in metres. */
export const TOL = 0.05;

const fmt = n => String(Math.round(n * 100) / 100);
const FENCE = /```([a-z]+)\n([\s\S]*?)```/g;

/** A config error line (`<file> › <path>: <message>`) as a finding. */
function fromLine(line) {
  const m = /^(.*?)(?: › (.*?))?: ([\s\S]*)$/.exec(line);
  return { level: 'error', code: 'CONFIG', file: m ? m[1] : '', path: m?.[2] ?? '', message: m ? m[3] : line, hint: '' };
}

/**
 * `built` is `{ scene, pois, errors }` from inspectScene. `ctx`:
 * - `files`  Map of the folder's text files (path → text): scene.json, POI files, Markdown pages
 * - `exists` async path → whether that file is in the scene folder (media, data, modules)
 * - `listed` whether `scenes/index.json` names this scene (omit when not known)
 */
export async function lintScene(built, { files = new Map(), exists = async () => true, listed } = {}) {
  const out = built.errors.map(fromLine);
  const add = (level, code, file, path, message, hint = '') => out.push({ level, code, file, path, message, hint });
  const { scene, pois } = built;
  if (!scene) {
    add('info', 'GEO_SKIPPED', '', '', 'scene.json has errors, so positions and references were not checked');
    return out;
  }
  const sceneFile = `${scene.name}/scene.json`;
  if (listed === false) add('warn', 'INDEX_MISSING', 'scenes/index.json', 'scenes', `"${scene.name}" is not listed`, `add "${scene.name}" to the list, or the test suite fails and no scene picker shows it`);

  const all = sceneObjects(scene, pois);
  refs({ scene, pois, all, files, add });
  for (const path of sceneRefs(files, scene.registry)) {
    if (!(await exists(path))) add('error', 'REF_MEDIA', sceneFile, '', `the scene refers to "${path}", which is not in the folder`, 'add the file or correct the path (paths are relative to the scene folder)');
  }
  room({ scene, files, add, sceneFile });
  objects({ scene, all, add });
  cameras({ scene, pois, all, files, add });
  return out;
}

function refs({ scene, pois, all, files, add }) {
  const ids = new Set(pois.map(p => p.id));
  const known = [...ids].join(', ');
  const hotspotsOf = id => pois.find(p => p.id === id).objects.flatMap(o => scene.registry.get(o.type).hotspots(o.props));
  for (const { file, path, owner, obj } of all) {
    for (const [name, a] of Object.entries(obj.actions)) {
      const at = `${path}.actions.${name}`;
      if ((a.type === 'goTo' || a.type === 'zoom') && typeof a.poi === 'string' && !ids.has(a.poi)) {
        add('error', 'REF_POI', file, `${at}.poi`, `no POI has the id "${a.poi}"`, `known ids: ${known}`);
        continue;
      }
      if (a.type === 'zoom' && a.screen) {
        const target = a.poi ?? owner;
        if (target && !hotspotsOf(target).includes(a.screen)) add('warn', 'REF_SCREEN', file, `${at}.screen`, `POI "${target}" has no screen "${a.screen}"`, `its clickable parts are: ${hotspotsOf(target).join(', ') || 'none'}`);
      }
      if (a.type === 'openUrl' && a.url.startsWith('#') && !ids.has(a.url.slice(1))) add('warn', 'REF_LINK', file, `${at}.url`, `no POI has the id "${a.url.slice(1)}"`, `known ids: ${known}`);
    }
  }
  for (const p of pois) {
    const file = `${scene.name}/${p.file}`;
    p.content.blocks.forEach((b, i) => {
      if (b.type !== 'markdown') return;
      const where = pageOf(files, scene.name, p, i);
      for (const [, id] of b.text.matchAll(/\]\(#([^)\s]*)\)/g)) {
        if (id && !ids.has(id)) add('warn', 'REF_LINK', where.file ?? file, where.path, `a link points at "#${id}", but no POI has that id`, `known ids: ${known}`);
      }
      for (const [, type, body] of b.text.matchAll(FENCE)) {
        const problem = fenceProblem(type, body);
        if (problem) add('error', 'MD_BLOCK', where.file ?? file, where.path, `the \`\`\`${type} block is not valid: ${problem}`, 'visitors would see a red error box in the panel');
      }
    });
  }
}

/** Where a POI's Markdown block lives: its page file when `content.markdown` named one, else the block in the POI file. */
function pageOf(files, name, poi, i) {
  let raw;
  try { raw = JSON.parse(files.get(poi.file) ?? ''); } catch { raw = null; }
  const md = raw?.content?.markdown;
  return typeof md === 'string' ? { file: `${name}/${md}`, path: '' } : { file: null, path: `content.blocks.${i}` };
}

/** What is wrong with a fenced block's body, or null: the same reading the panel gives it (src/ui/Markdown.jsx). */
function fenceProblem(type, body) {
  if (!Object.hasOwn(BLOCK_DATA, type)) return null; // an ordinary code block
  let data;
  try { data = JSON.parse(body); } catch (e) { return e.message; }
  const issues = list => list.map(i => `${i.path.join('.') || 'data'}: ${i.message}`).join('; ');
  if (FEED_BLOCKS.includes(type) && data && typeof data === 'object' && !Array.isArray(data) && 'feed' in data) {
    const r = feedBlockSchema(type).safeParse(data);
    return r.success ? null : issues(r.error.issues);
  }
  const r = parseBlockData(type, data);
  return r.ok ? null : issues(r.issues);
}

function room({ scene, files, add, sceneFile }) {
  const { footprint, height } = scene.room;
  let raw;
  try { raw = JSON.parse(files.get('scene.json') ?? '')?.room; } catch { raw = null; }
  if (raw?.footprint) {
    const b = bounds(footprint);
    for (const [key, real] of [['width', b.width], ['depth', b.depth]]) {
      if (typeof raw[key] === 'number' && Math.abs(raw[key] - real) > 0.01) add('warn', 'ROOM_SIZE_IGNORED', sceneFile, `room.${key}`, `${raw[key]} is ignored: the footprint is ${fmt(real)} m`, `remove "${key}", the footprint decides the room's size`);
    }
  }
  scene.room.lights.forEach(([x, y, z], i) => {
    if (!insideOrNear(footprint, x, z, TOL) || y < 0 || y > height + TOL) add('warn', 'LIGHT_OUTSIDE', sceneFile, `room.lights.${i}`, `the light at [${x}, ${y}, ${z}] is outside the room`, `keep x and z inside the floor plan and y between 0 and ${height}`);
  });
  scene.room.pillars.forEach(([x, z], i) => {
    if (!insideOrNear(footprint, x, z, TOL)) add('warn', 'PILLAR_OUTSIDE', sceneFile, `room.pillars.${i}`, `the pillar at [${x}, ${z}] is outside the floor plan`);
  });
}

const label = e => `${e.obj.name ?? e.obj.type} (${e.key})`;

function objects({ scene, all, add }) {
  const { footprint, height, pillars } = scene.room;
  const wallList = walls(footprint);
  const boxes = [];
  const unknown = new Set();
  for (const e of all) {
    const box = objectBox(e.obj, scene.registry);
    if (!box) {
      if (!unknown.has(e.obj.type)) add('info', 'GEO_UNKNOWN', e.file, e.path, `the size of "${e.obj.type}" is not known, so its position is not checked`, 'its prefab can declare `geometry` in its meta');
      unknown.add(e.obj.type);
      continue;
    }
    if (box.tilted) { add('info', 'GEO_TILTED', e.file, e.path, `${label(e)} is tilted (rotation about x or z), so its position is not checked`); continue; }
    boxes.push({ ...e, box });
    const [ox, oz] = box.origin;

    if (box.mount === 'wall') {
      const near = nearestWall(wallList, ox, oz);
      if (near.distance > TOL) {
        add('warn', 'WALL_GAP', e.file, `${e.path}.position`, `${label(e)} hangs on a wall but is ${fmt(near.distance)} m from the nearest one (${near.wall.name})`, 'a wall object\'s position is a point on the wall line; `at: { wall }` puts it there');
      } else if (box.front[0] * near.wall.normal[0] + box.front[1] * near.wall.normal[1] < Math.cos((10 * Math.PI) / 180)) {
        add('warn', 'WALL_FACING', e.file, `${e.path}.rotation`, `${label(e)} is on the ${near.wall.name} but does not face into the room`, `turn it so its front points away from the wall (yaw ${fmt(wallYaw(near.wall, box.local.front))})`);
      }
    }
    const worst = Math.max(...box.poly.map(([x, z]) => (insideOrNear(footprint, x, z, TOL) ? 0 : nearestWall(wallList, x, z).distance)));
    if (worst > 0) add('error', 'OBJ_OUTSIDE', e.file, `${e.path}.position`, `${label(e)} reaches ${fmt(worst)} m outside the room`, 'move it inwards by at least that much, or make it smaller');

    if (box.y1 > height + TOL) add('warn', 'OBJ_ABOVE_CEILING', e.file, `${e.path}.position`, `${label(e)} reaches y ${fmt(box.y1)}, above the ${height} m ceiling`);
    if (box.y0 < -TOL) add('warn', 'OBJ_BELOW_FLOOR', e.file, `${e.path}.position`, `${label(e)} reaches y ${fmt(box.y0)}, below the floor`);
    else if (box.mount === 'floor' && Math.abs(e.obj.position[1]) > 0.02) add('warn', 'OBJ_FLOATING', e.file, `${e.path}.position`, `${label(e)} stands on the floor but its y is ${e.obj.position[1]}`, 'set y to 0, or put the step it stands on in the scene');
    else if (box.mount === 'ceiling' && Math.abs(e.obj.position[1] - height) > TOL) add('warn', 'OBJ_FLOATING', e.file, `${e.path}.position`, `${label(e)} hangs from the ceiling but its y is ${e.obj.position[1]}, the ceiling is at ${height}`);
  }

  const apart = (a, b) => Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0) <= TOL;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (apart(a, b)) continue;
      const depth = penetration(a.box.poly, b.box.poly);
      if (depth > TOL) add('warn', 'OBJ_OVERLAP', b.file, `${b.path}.position`, `${label(b)} and ${label(a)} overlap by ${fmt(depth)} m`, 'move one of them apart by at least that much');
    }
    pillars.forEach((p, k) => {
      const depth = penetration(boxes[i].box.poly, pillarPoly(p));
      if (depth > TOL && boxes[i].box.y0 < height) add('warn', 'PILLAR_OVERLAP', boxes[i].file, `${boxes[i].path}.position`, `${label(boxes[i])} overlaps the pillar at [${p[0]}, ${p[1]}] (room.pillars.${k}, ${PILLAR_HALF * 2} m base) by ${fmt(depth)} m`, 'move one of them apart by at least that much');
    });
  }
}

const span = (poly, i) => Math.max(...poly.map(p => p[i])) - Math.min(...poly.map(p => p[i]));

function cameras({ scene, pois, all, files, add }) {
  const { footprint, height } = scene.room;
  const boxes = all.map(e => ({ ...e, box: objectBox(e.obj, scene.registry) })).filter(e => e.box && !e.box.tilted);
  for (const p of pois) {
    const file = `${scene.name}/${p.file}`, [x, y, z] = p.camera.position;
    // a camera the file does not write is the automatic one, in front of the stop's first object
    let auto = false;
    try { auto = !JSON.parse(files.get(p.file) ?? '{}').camera; } catch { /* unreadable: treat as written */ }
    const here = `at [${[x, y, z].map(fmt).join(', ')}]`;
    const fix = auto ? `this is the automatic camera, placed in front of the stop's first object; give the stop its own "camera": { "position": [x, y, z], "target": [x, y, z] }` : 'move the camera';
    if (!insideOrNear(footprint, x, z, 0) || y < 0 || y > height) {
      add('warn', 'CAM_OUTSIDE_ROOM', file, 'camera.position', `the camera of "${p.id}" ${here} is outside the room`, `visitors would look at the back of a wall; ${fix}, inside the floor plan and below the ceiling`);
      continue;
    }
    const inside = boxes.find(e => pointInBox(e.box, p.camera.position));
    if (inside) { add('warn', 'CAM_IN_OBJECT', file, 'camera.position', `the camera of "${p.id}" ${here} is inside ${label(inside)}, which is ${fmt(span(inside.box.poly, 0))} m east–west by ${fmt(span(inside.box.poly, 1))} m north–south around [${inside.box.centre.map(fmt).join(', ')}]`, `${fix}, clear of that object, or move the object`); continue; }
    const blocker = boxes.find(e => e.owner !== p.id && segmentHitsBox(e.box, p.camera.position, p.camera.target));
    if (blocker) add('warn', 'CAM_BLOCKED', file, 'camera', `${label(blocker)} stands between the camera of "${p.id}" ${here} and what it looks at`, `${fix}, or move the object out of the line of sight`);
  }
}

/** One finding as a line: `warn  CODE  file › path: message (hint)`. */
export function formatFinding(f) {
  const where = [f.file, f.path].filter(Boolean).join(' › ');
  return `${f.level.padEnd(5)} ${f.code}  ${where}${where ? ': ' : ''}${f.message}${f.hint ? ` (${f.hint})` : ''}`;
}
