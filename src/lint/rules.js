import { insideOrNear, nearestWall, walls, bounds } from '../lib/footprint.js';
import { BLOCK_DATA, FEED_BLOCKS, feedBlockSchema, parseBlockData } from '../ui/blocks/schema.js';
import { sceneRefs } from '../editor/export.js';
import { wallYaw } from '../config/placement.js';
import * as THREE from 'three';
import { PILLAR_HALF, framing, objectBox, penetration, pillarPoly, pointInBox, sceneObjects, segmentHitsBox } from './geometry.js';
import { checkBrief } from './expect.js';

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
export const lintScene = async (built, ctx) => (await inspectFindings(built, ctx)).findings;

/**
 * The same checks with what `brief.json` came to: `{ findings, expectations: { total, held }, brief }`, where
 * `brief` is the description the scene was built from (null without one). See src/lint/expect.js.
 */
export async function inspectFindings(built, { files = new Map(), exists = async () => true, listed } = {}) {
  const out = built.errors.map(fromLine);
  const result = brief => ({ findings: out, expectations: { total: brief?.total ?? 0, held: brief?.held ?? 0 }, brief: brief?.text ?? null });
  const add = (level, code, file, path, message, hint = '') => out.push({ level, code, file, path, message, hint });
  const { scene, pois } = built;
  if (!scene) {
    add('info', 'GEO_SKIPPED', '', '', 'scene.json has errors, so positions, references and the brief were not checked');
    return result();
  }
  const sceneFile = `${scene.name}/scene.json`;
  if (listed === false) add('warn', 'INDEX_MISSING', 'scenes/index.json', 'scenes', `"${scene.name}" is not listed`, `add "${scene.name}" to the list, or the test suite fails and no scene picker shows it`);

  const all = sceneObjects(scene, pois);
  refs({ scene, pois, all, files, add });
  for (const path of sceneRefs(files, scene.registry)) {
    if (!(await exists(path))) add('error', 'REF_MEDIA', sceneFile, '', `the scene refers to "${path}", which is not in the folder`, 'add the file or correct the path (paths are relative to the scene folder)');
  }
  room({ scene, files, add, sceneFile });
  theme({ scene, add, sceneFile });
  objects({ scene, all, add });
  cameras({ scene, pois, all, files, add });
  // what the brief expects is only worth evaluating on a scene that loads: a config error would fail half of it
  const brief = built.errors.length ? null : checkBrief(scene, pois, files.get('brief.json'));
  if (brief) out.push(...brief.findings);
  else if (files.has('brief.json')) add('info', 'EXPECT_SKIPPED', `${scene.name}/brief.json`, '', 'the scene has config errors, so the brief was not checked');
  return result(brief);
}

/** A CSS colour as [r, g, b, alpha] with channels 0–1, or null when it is not one this can read (a gradient, a variable). */
function rgbaOf(css) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(String(css).trim());
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  if (!/^#[0-9a-f]{3,8}$/i.test(String(css).trim()) && !Object.hasOwn(THREE.Color.NAMES, String(css).trim().toLowerCase())) return null;
  const hex = String(css).trim(), long = hex.length === 9, short = hex.length === 5;
  const c = new THREE.Color().setStyle(long ? hex.slice(0, 7) : short ? hex.slice(0, 4) : hex, THREE.LinearSRGBColorSpace);
  return [c.r, c.g, c.b, long ? parseInt(hex.slice(7), 16) / 255 : short ? parseInt(hex[4] + hex[4], 16) / 255 : 1];
}

/** The contrast ratio of two opaque colours (WCAG 2): 1 is none, 21 black on white. */
function contrast(a, b) {
  const lum = ([r, g, bl]) => [r, g, bl].map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text a visitor has to read must stand out from what is behind it: the checks a look at the page would make. */
function theme({ scene, add, sceneFile }) {
  const t = scene.theme, bg = rgbaOf(t.background);
  if (!bg) return;
  const over = c => c && [0, 1, 2].map(i => c[i] * c[3] + bg[i] * (1 - c[3]));
  const panel = over(rgbaOf(t.surface)) ?? bg;
  const pairs = [
    ['text', 'background', bg, 4.5, 'panel text on the room\'s background'], ['text', 'surface', panel, 4.5, 'panel text on the panel'],
    ['textDim', 'surface', panel, 3, 'secondary text on the panel'], ['accent', 'background', bg, 3, 'lines and titles on the room\'s background'],
    ['accentInk', 'accent', over(rgbaOf(t.accent)), 4.5, 'button text on a button'],
  ];
  for (const [key, on, behind, least, what] of pairs) {
    const front = over(rgbaOf(t[key]));
    if (!front || !behind) continue;
    const ratio = contrast(front, behind);
    if (ratio < least) add('warn', 'THEME_CONTRAST', sceneFile, `theme.${key}`, `${what}: ${t[key]} on ${t[on]} has a contrast of ${fmt(ratio)}:1, under ${least}:1`, `make "${key}" ${contrast(behind, [1, 1, 1]) > contrast(behind, [0, 0, 0]) ? 'lighter' : 'darker'}, or change "${on}"`);
  }
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
    if (e.obj.unplaced) continue; // its `at` or `facing` has a config error, reported already: it is not where it will be
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
  const boxes = all.filter(e => !e.obj.unplaced).map(e => ({ ...e, box: objectBox(e.obj, scene.registry) })).filter(e => e.box && !e.box.tilted);
  for (const p of pois) {
    if (p.objects[0].unplaced && !pageCamera(files, p)) continue; // the automatic camera follows an object that is not placed
    const file = `${scene.name}/${p.file}`, [x, y, z] = p.camera.position;
    // a camera the file does not write is the automatic one, in front of the stop's first object
    const auto = !pageCamera(files, p);
    const here = `at [${[x, y, z].map(fmt).join(', ')}]`;
    const fix = auto ? `this is the automatic camera, placed in front of the stop's first object; give the stop its own "camera": { "position": [x, y, z], "target": [x, y, z] }` : 'move the camera';
    if (!insideOrNear(footprint, x, z, 0) || y < 0 || y > height) {
      add('warn', 'CAM_OUTSIDE_ROOM', file, 'camera.position', `the camera of "${p.id}" ${here} is outside the room`, `visitors would look at the back of a wall; ${fix}, inside the floor plan and below the ceiling`);
      continue;
    }
    const inside = boxes.find(e => pointInBox(e.box, p.camera.position));
    if (inside) { add('warn', 'CAM_IN_OBJECT', file, 'camera.position', `the camera of "${p.id}" ${here} is inside ${label(inside)}, which is ${fmt(span(inside.box.poly, 0))} m east–west by ${fmt(span(inside.box.poly, 1))} m north–south around [${inside.box.centre.map(fmt).join(', ')}]`, `${fix}, clear of that object, or move the object`); continue; }
    const blocker = boxes.find(e => e.owner !== p.id && segmentHitsBox(e.box, p.camera.position, p.camera.target));
    if (blocker) { add('warn', 'CAM_BLOCKED', file, 'camera', `${label(blocker)} stands between the camera of "${p.id}" ${here} and what it looks at`, `${fix}, or move the object out of the line of sight`); continue; }
    // the stop's own objects: at least one of them should be something to look at from here
    const own = boxes.filter(e => e.owner === p.id).map(e => ({ e, f: framing(p.camera, scene.camera.fov, e.box) }));
    if (own.length && !own.some(v => v.f.visible && v.f.cover >= 0.01)) {
      const best = own.sort((a, b) => b.f.cover - a.f.cover)[0];
      add('warn', 'CAM_FRAMING', file, 'camera', `from the camera of "${p.id}" ${here} none of the stop's own objects fills 1% of the picture (${label(best.e)}: ${best.f.visible ? `${fmt(best.f.cover * 100)}%` : 'not in view'})`, `${fix} so that it looks at them from 4 to 12 m away`);
    }
  }
}

/** Whether a POI file writes its own camera; an unreadable file counts as written. */
function pageCamera(files, poi) {
  try { return !!JSON.parse(files.get(poi.file) ?? '{}').camera; } catch { return true; }
}

/** One finding as a line: `warn  CODE  file › path: message (hint)`. */
export function formatFinding(f) {
  const where = [f.file, f.path].filter(Boolean).join(' › ');
  return `${f.level.padEnd(5)} ${f.code}  ${where}${where ? ': ' : ''}${f.message}${f.hint ? ` (${f.hint})` : ''}`;
}
