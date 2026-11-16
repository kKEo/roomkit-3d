import { corners, walls } from '../lib/footprint.js';
import { DIRECTIONS, SIDES, findCorner, findWall } from '../config/placement.js';
import { unknownKeys } from '../config/keyHelp.js';
import { framing, objectBox, sceneObjects, segmentHitsBox } from './geometry.js';
import { compass, gap } from './describe.js';

/**
 * A scene's brief as something a machine can check. `brief.json` in a scene folder holds the description the
 * scene was built from and what must therefore be true of it:
 *
 *   { "text": "A desk in the north-east corner facing west, three frames on the north wall …",
 *     "expect": [ { "object": "desk", "corner": "north-east" }, { "count": "pictureFrame", "is": 3, "wall": "north" } ] }
 *
 * `node tools/scene.js check` evaluates every expectation against the built scene, so "does it match what was asked
 * for" is answered by the tool and stays answered when the scene is edited later. An expectation that does not
 * hold is `EXPECT_FAILED`; one that cannot be read (an unknown key, a name no object has) is `EXPECT_INVALID`.
 * Objects are referred to by their `name`, as in placement (src/config/placement.js).
 *
 * `EXPECTATIONS` is the vocabulary: each entry names its keys, says in a line what it means (printed by
 * `node tools/scene.js keys brief`) and has the test. Add a form there and it is validated, documented and run.
 */

class Invalid extends Error {}

const n = v => String(Math.round(v * 10) / 10);
const pct = v => `${Math.round(v * 100)}%`;
const q = name => `"${name}"`;
const num = v => typeof v === 'number' && Number.isFinite(v);
const amount = v => num(v) && v >= 0;
const str = v => typeof v === 'string' && v.length > 0;
const list = v => Array.isArray(v) && v.length > 0 && v.every(str);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** The outline of an object on the floor; one without a declared size is the point it stands on. */
const foot = x => x.box?.poly ?? [[x.obj.position[0], x.obj.position[2]]];
const centre = x => x.box?.centre ?? [x.obj.position[0], x.obj.position[2]];

function wallOf(ctx, name) {
  const found = findWall(ctx.walls, name);
  if (found.error) throw new Invalid(found.error);
  return found.wall;
}

/** The direction a side word means next to `y`: a compass side, or left / right / front / behind as seen standing in front of it. */
function sideOf(side, y, name) {
  if (Object.hasOwn(DIRECTIONS, side)) return DIRECTIONS[side];
  if (!y.box) throw new Invalid(`the size of ${q(name)} is not known, so it has no ${side}; use a compass side`);
  const f = y.box.front, right = [f[1], -f[0]];
  return side === 'front' ? f : side === 'behind' ? [-f[0], -f[1]] : side === 'right' ? right : [-right[0], -right[1]];
}

/** What a stop's camera makes of an object: null when it is in the picture, whole, large enough and not hidden; else what is wrong. */
function sight(ctx, poi, x, name, share, others) {
  if (!x.box) throw new Invalid(`the size of ${q(name)} is not known, so what the camera sees of it is not either`);
  const f = framing(poi.camera, ctx.scene.camera.fov, x.box);
  if (!f.visible) return `${q(name)} is not in the picture`;
  if (f.cut) return `${q(name)} is cut off at the edge of the picture`;
  if (f.cover < share) return `${q(name)} fills ${pct(f.cover)} of the picture, less than ${pct(share)}`;
  const mid = [x.box.centre[0], (x.box.y0 + x.box.y1) / 2, x.box.centre[1]];
  const hider = ctx.all.find(o => o !== x && o.box && !others.includes(o) && segmentHitsBox(o.box, poi.camera.position, mid));
  return hider ? `${q(name)} is hidden behind ${hider.obj.name ?? hider.obj.type} (${hider.key})` : null;
}

/**
 * The forms an expectation can take. `subject` and `lead` are the two keys that tell which form an entry is;
 * `keys` checks each key's value; `form` and `says` document it; `test(e, ctx)` returns null when it holds and
 * otherwise what is true instead, and throws `Invalid` when the entry cannot be evaluated.
 */
export const EXPECTATIONS = [
  {
    subject: 'object', lead: 'wall', keys: { wall: v => str(v) || Number.isInteger(v), within: amount },
    form: '{ "object": X, "wall": "north", "within": 0.1 }',
    says: 'X is on or against that wall (a compass side or the wall\'s number), at most `within` metres off it; default 0.1',
    test(e, ctx) {
      const wall = wallOf(ctx, e.wall), x = ctx.object(e.object), d = gap(foot(x), [wall.a, wall.b]), max = e.within ?? 0.1;
      return d <= max + 0.01 ? null : `${q(e.object)} is ${n(d)} m from the ${wall.name}, not within ${n(max)} m`;
    },
  },
  {
    subject: 'object', lead: 'corner', keys: { corner: v => str(v) || Number.isInteger(v), within: amount },
    form: '{ "object": X, "corner": "north-east", "within": 2 }',
    says: 'X reaches to within that many metres of the corner (a compass corner or the vertex\'s number); default 2',
    test(e, ctx) {
      const found = findCorner(ctx.corners, e.corner, ctx.scene.room.footprint.length);
      if (found.error) throw new Invalid(found.error);
      const d = gap(foot(ctx.object(e.object)), [found.corner.point]), max = e.within ?? 2;
      return d <= max + 0.01 ? null : `${q(e.object)} is ${n(d)} m from the ${found.corner.name}, not within ${n(max)} m`;
    },
  },
  {
    subject: 'object', lead: 'centre', keys: { centre: v => v === true, within: amount },
    form: '{ "object": X, "centre": true, "within": 2 }',
    says: 'X\'s middle is within that many metres of the middle of the room; default 2',
    test(e, ctx) {
      const c = centre(ctx.object(e.object)), m = ctx.scene.room.centre, d = Math.hypot(c[0] - m[0], c[1] - m[1]), max = e.within ?? 2;
      return d <= max + 0.01 ? null : `${q(e.object)} is ${n(d)} m from the middle of the room, not within ${n(max)} m`;
    },
  },
  {
    subject: 'object', lead: 'near', keys: { near: str, within: amount, atLeast: amount },
    form: '{ "object": X, "near": Y, "within": 2 }',
    says: 'the gap between X and Y is at most `within` metres (default 2); `atLeast` sets a least gap instead, or as well',
    test(e, ctx) {
      const d = gap(foot(ctx.object(e.object)), foot(ctx.object(e.near))), max = e.within ?? (e.atLeast == null ? 2 : Infinity);
      if (d > max + 0.01) return `${q(e.object)} is ${n(d)} m from ${q(e.near)}, not within ${n(max)} m`;
      return e.atLeast != null && d < e.atLeast - 0.01 ? `${q(e.object)} is ${n(d)} m from ${q(e.near)}, closer than ${n(e.atLeast)} m` : null;
    },
  },
  {
    subject: 'object', lead: 'side', keys: { side: v => SIDES.includes(v), of: str }, needs: ['of'],
    form: '{ "object": X, "side": "left", "of": Y }',
    says: `X lies on that side of Y: ${SIDES.join(', ')}; left and right are as seen standing in front of Y`,
    test(e, ctx) {
      const x = ctx.object(e.object), y = ctx.object(e.of), d = sideOf(e.side, y, e.of);
      const v = [centre(x)[0] - centre(y)[0], centre(x)[1] - centre(y)[1]], len = Math.hypot(...v);
      if (len < 0.05) return `${q(e.object)} stands where ${q(e.of)} does`;
      if (dot(v, d) / len >= Math.SQRT1_2 - 1e-6) return null;
      const where = Object.hasOwn(DIRECTIONS, e.side) ? `not ${e.side}` : `and its ${e.side} is ${compass(d)}`;
      return `${q(e.object)} is ${compass(v)} of ${q(e.of)}, ${where}`;
    },
  },
  {
    subject: 'object', lead: 'facing', keys: { facing: str },
    form: '{ "object": X, "facing": "west" }',
    says: 'X\'s front points that way within 30°: a compass direction, "centre" (the middle of the room) or another object\'s name',
    test(e, ctx) {
      const x = ctx.object(e.object);
      if (!x.box) throw new Invalid(`the size of ${q(e.object)} is not known, so which way it faces is not either`);
      const to = Object.hasOwn(DIRECTIONS, e.facing) ? null : e.facing === 'centre' ? ctx.scene.room.centre : centre(ctx.object(e.facing));
      const d = to ? [to[0] - x.box.centre[0], to[1] - x.box.centre[1]] : DIRECTIONS[e.facing], len = Math.hypot(...d);
      if (len < 0.05 || dot(x.box.front, d) / len >= Math.cos(Math.PI / 6) - 1e-6) return null;
      return `${q(e.object)} faces ${compass(x.box.front)}, ${to ? `and ${e.facing === 'centre' ? 'the middle of the room' : q(e.facing)} is ${compass(d)} of it` : `not ${e.facing}`}`;
    },
  },
  {
    subject: 'object', lead: 'click', keys: { click: str, goTo: v => v === null || str(v), opens: str, action: str },
    form: '{ "object": X, "click": "door", "goTo": "wing" }',
    says: 'a click on that part of X goes to that stop (`"goTo": null` is the whole-room view); or `"opens": "<url>"`, or `"action": "<type>"` for any other action',
    test(e, ctx) {
      const want = ['goTo', 'opens', 'action'].filter(k => e[k] !== undefined);
      if (want.length !== 1) throw new Invalid('say what the click does: one of "goTo", "opens", "action"');
      const x = ctx.object(e.object), a = x.obj.actions[e.click];
      if (!a) return `${q(e.object)} does nothing when ${q(e.click)} is clicked (${Object.keys(x.obj.actions).length ? `it has actions on: ${Object.keys(x.obj.actions).join(', ')}` : 'it has no actions'})`;
      const does = a.type === 'goTo' ? `goes to ${a.poi ?? 'the whole-room view'}` : a.type === 'openUrl' ? `opens ${a.url}` : `does "${a.type}"`;
      const ok = e.goTo !== undefined ? a.type === 'goTo' && a.poi === e.goTo : e.opens !== undefined ? a.type === 'openUrl' && a.url === e.opens : a.type === e.action;
      return ok ? null : `a click on ${q(e.click)} of ${q(e.object)} ${does}`;
    },
  },
  {
    subject: 'stop', lead: 'sees', keys: { sees: list, share: v => num(v) && v > 0 && v <= 1 },
    form: '{ "stop": S, "sees": [X, Y], "share": 0.02 }',
    says: 'from stop S\'s camera each of them is in the picture, whole, not hidden behind another object, and fills at least that share of it; default 0.02',
    test(e, ctx) {
      const poi = ctx.stop(e.stop), seen = e.sees.map(name => ctx.object(name));
      const wrong = e.sees.map((name, i) => sight(ctx, poi, seen[i], name, e.share ?? 0.02, seen)).filter(Boolean);
      return wrong.length ? `from stop ${q(e.stop)}: ${wrong.join('; ')}` : null;
    },
  },
  {
    subject: 'stop', lead: 'order', keys: { order: v => list(v) && v.length > 1 },
    form: '{ "stop": S, "order": [X, Y, Z] }',
    says: 'seen from stop S\'s camera they stand in that order from left to right',
    test(e, ctx) {
      const poi = ctx.stop(e.stop);
      const at = e.order.map(name => {
        const x = ctx.object(name);
        if (!x.box) throw new Invalid(`the size of ${q(name)} is not known, so where it is in the picture is not either`);
        return { name, f: framing(poi.camera, ctx.scene.camera.fov, x.box) };
      });
      const out = at.filter(v => !v.f.visible);
      if (out.length) return `from stop ${q(e.stop)}: ${out.map(v => q(v.name)).join(', ')} ${out.length === 1 ? 'is' : 'are'} not in the picture`;
      const sorted = [...at].sort((a, b) => a.f.centre[0] - b.f.centre[0]).map(v => v.name);
      return sorted.every((name, i) => name === e.order[i]) ? null : `from stop ${q(e.stop)}, left to right they are: ${sorted.join(', ')}`;
    },
  },
  {
    subject: 'count', lead: 'is', keys: { is: v => Number.isInteger(v) && v >= 0, wall: v => str(v) || Number.isInteger(v), stop: str }, needs: ['is'],
    form: '{ "count": "pictureFrame", "is": 3, "wall": "north" }',
    says: 'the scene has that many objects of the type; with `wall`, on or against that wall; with `stop`, in that stop',
    test(e, ctx) {
      if (!ctx.scene.registry.has(e.count)) throw new Invalid(`there is no object type "${e.count}" (types: ${ctx.scene.registry.types().join(', ')})`);
      const wall = e.wall === undefined ? null : wallOf(ctx, e.wall), poi = e.stop === undefined ? null : ctx.stop(e.stop);
      const found = ctx.all.filter(x => x.obj.type === e.count && (!poi || x.owner === poi.id) && (!wall || gap(foot(x), [wall.a, wall.b]) <= 0.11)).length;
      const where = `${wall ? ` on the ${wall.name}` : ''}${poi ? ` in stop ${q(poi.id)}` : ''}`;
      return found === e.is ? null : `there ${found === 1 ? 'is' : 'are'} ${found} ${e.count}${where}, not ${e.is}`;
    },
  },
  {
    subject: 'room', lead: 'room', keys: { room: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, m]) => ['width', 'depth', 'height'].includes(k) && num(m)) },
    form: '{ "room": { "width": 24, "depth": 24, "height": 7 } }',
    says: 'the room measures that, in metres: width is east–west, depth north–south; give any of the three',
    test(e, ctx) {
      const off = Object.entries(e.room).filter(([k, v]) => Math.abs(ctx.scene.room[k] - v) > 0.05);
      return off.length ? `the room's ${off.map(([k]) => `${k} is ${n(ctx.scene.room[k])} m`).join(' and ')}, not ${off.map(([, v]) => n(v)).join(' and ')}` : null;
    },
  },
  {
    subject: 'stops', lead: 'stops', keys: { stops: list },
    form: '{ "stops": ["wall", "studio", "wing"] }',
    says: 'the tour visits exactly those stops, by id, in that order',
    test(e, ctx) {
      const ids = ctx.pois.map(p => p.id);
      return ids.length === e.stops.length && ids.every((id, i) => id === e.stops[i]) ? null : `the tour is: ${ids.join(', ')}`;
    },
  },
];

/** What an expectation is about, in the order the keys are looked for: a count may name a stop, so it comes first. */
const SUBJECTS = ['object', 'count', 'stop', 'room', 'stops'];
const leads = subject => EXPECTATIONS.filter(f => f.subject === subject).map(f => f.lead);

/** The form an expectation takes, after checking its keys; throws `Invalid` saying what is wrong with it. */
function formOf(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Invalid('an expectation is an object such as { "object": "desk", "wall": "north" }');
  const subject = SUBJECTS.find(s => e[s] !== undefined);
  if (!subject) throw new Invalid(`say what it is about: one of ${SUBJECTS.map(q).join(', ')}`);
  const forms = EXPECTATIONS.filter(f => f.subject === subject);
  const hits = forms.filter(f => e[f.lead] !== undefined);
  if (hits.length !== 1) throw new Invalid(`say ${hits.length ? 'one thing' : 'what is expected'} of ${subject === 'object' || subject === 'stop' ? q(e[subject]) : `the ${subject}`}: one of ${leads(subject).map(q).join(', ')}`);
  const [form] = hits;
  if (!(subject in form.keys) && !str(e[subject])) throw new Invalid(`"${subject}" must be ${subject === 'object' ? 'the "name" of an object' : subject === 'stop' ? 'the id of a stop' : 'an object type'}`);
  const known = [...new Set([subject, ...Object.keys(form.keys)])];
  const extra = Object.keys(e).filter(k => !known.includes(k));
  if (extra.length) throw new Invalid(unknownKeys(extra, known));
  for (const [key, ok] of Object.entries(form.keys)) if (e[key] !== undefined && !ok(e[key])) throw new Invalid(`"${key}" has a value this form does not take; write it as ${form.form}`);
  for (const key of form.needs ?? []) if (e[key] === undefined) throw new Invalid(`"${key}" is missing; write it as ${form.form}`);
  return form;
}

/**
 * Evaluates a scene's `brief.json` (its text, or undefined when the scene has none) against the built scene:
 * `{ findings, total, held, text }`. `findings` are in the shape of src/lint/rules.js; `text` is the brief.
 */
export function checkBrief(scene, pois, raw) {
  const file = `${scene.name}/brief.json`, findings = [];
  const add = (code, path, message, hint = '') => findings.push({ level: 'error', code, file, path, message, hint });
  const none = { findings, total: 0, held: 0, text: null };
  if (raw == null) return none;
  let brief;
  try { brief = JSON.parse(raw); } catch (err) { add('EXPECT_INVALID', '', `invalid JSON — ${err.message}`); return none; }
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) { add('EXPECT_INVALID', '', 'a brief is { "text": "…", "expect": [ … ] }'); return none; }
  const extra = Object.keys(brief).filter(k => k !== 'text' && k !== 'expect');
  if (extra.length) add('EXPECT_INVALID', '', unknownKeys(extra, ['text', 'expect']));
  if (!str(brief.text)) add('EXPECT_INVALID', 'text', 'give the description the scene was built from');
  if (!Array.isArray(brief.expect)) { add('EXPECT_INVALID', 'expect', 'a list of expectations; see `node tools/scene.js keys brief`'); return { ...none, text: str(brief.text) ? brief.text : null }; }

  const all = sceneObjects(scene, pois).filter(x => !x.obj.unplaced).map(x => ({ ...x, box: objectBox(x.obj, scene.registry) }));
  const named = new Map();
  for (const x of all) if (str(x.obj.name)) named.set(x.obj.name, [...(named.get(x.obj.name) ?? []), x]);
  const ctx = {
    scene, pois, all, walls: walls(scene.room.footprint), corners: corners(scene.room.footprint),
    object(name) {
      const hits = named.get(name) ?? [];
      if (hits.length === 1) return hits[0];
      throw new Invalid(hits.length ? `${q(name)} names ${hits.length} objects; give them different names` : `no object is named ${q(name)} (${named.size ? `named objects: ${[...named.keys()].join(', ')}` : 'no object in this scene has a "name"; give one to each object the brief speaks of'})`);
    },
    stop(id) {
      const poi = pois.find(p => p.id === id);
      if (!poi) throw new Invalid(`no stop has the id ${q(id)} (stops: ${pois.map(p => p.id).join(', ')})`);
      return poi;
    },
  };
  let held = 0;
  brief.expect.forEach((e, i) => {
    try {
      const failure = formOf(e).test(e, ctx);
      if (failure) add('EXPECT_FAILED', `expect.${i}`, failure, `the brief expects ${JSON.stringify(e)}; change the scene, or the expectation if the brief changed`);
      else held++;
    } catch (err) {
      if (!(err instanceof Invalid)) throw err;
      add('EXPECT_INVALID', `expect.${i}`, err.message, 'see `node tools/scene.js keys brief`');
    }
  });
  return { findings, total: brief.expect.length, held, text: str(brief.text) ? brief.text : null };
}

/** A new scene's `brief.json`: the description, and no expectations yet. */
export const briefFile = text => `${JSON.stringify({ text, expect: [] }, null, 2)}\n`;
