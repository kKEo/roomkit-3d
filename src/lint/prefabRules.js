import { z } from 'zod';
import { autoPlacement } from '../lib/autoCamera.js';
import { framing, objectBox } from './geometry.js';
import { moved, openStage } from './stage.js';

/**
 * The checks behind `node tools/scene.js prefab check`: what a scene's own object type gets wrong that loading
 * its module does not show. The component is rendered on a stage without a browser (src/lint/stage.js) for its
 * default props and for each prop changed in turn, and what comes out is compared with what its meta declares:
 * the size, what it stands on, the clickable parts, what moves. Findings have the shape of src/lint/rules.js.
 */

/** Slack between the declared box and the measured parts, in metres. */
export const SLACK = 0.05;
const AXES = ['x', 'y', 'z'];
const f = v => String(Math.round(v * 100) / 100);
const box3 = b => `min: [${b.min.map(f).join(', ')}], max: [${b.max.map(f).join(', ')}]`;

/** What a part is called in a message: its name, else its shape and its place in the list. */
export const partLabel = (p, i) => (p.name ? `"${p.name}"` : `${p.kind === 'solid' || p.kind === 'outline' ? p.shape : p.kind} (part ${i + 1})`);

/**
 * The props to try: the defaults first, then each prop on its own at a low and a high value, each other choice
 * of an enum and the other side of a tick box. `[{ props, with }]`, `with` being the change in words ('' for the defaults).
 */
export function sampleProps(entry, limit = 40) {
  const out = [{ props: entry.props, with: '' }];
  let shape = {};
  try { shape = z.toJSONSchema(entry.schema, { io: 'input', unrepresentable: 'any' }).properties ?? {}; } catch { /* a schema that cannot be described: defaults only */ }
  for (const [key, node] of Object.entries(shape)) {
    const d = entry.props[key];
    let tries = [];
    if (typeof d === 'boolean') tries = [!d];
    else if (Array.isArray(node.enum)) tries = node.enum.filter(v => v !== d).slice(0, 12);
    else if (typeof d === 'number') {
      const whole = node.type === 'integer', fit = v => (whole ? Math.round(v) : Math.round(v * 1000) / 1000);
      const least = node.minimum ?? (node.exclusiveMinimum != null ? (whole ? node.exclusiveMinimum + 1 : null) : null);
      const most = node.maximum != null && node.maximum < Number.MAX_SAFE_INTEGER ? node.maximum : null;
      tries = [least ?? d / 2, most ?? (d === 0 ? 1 : d * 2)].map(fit).filter(v => v !== d && (node.exclusiveMinimum == null || v > node.exclusiveMinimum));
    }
    for (const v of [...new Set(tries)]) {
      const r = entry.schema.safeParse({ [key]: v });
      if (r.success && out.length < limit) out.push({ props: r.data, with: ` with { "${key}": ${JSON.stringify(v)} }` });
    }
  }
  return out;
}

/** How far the body reaches past the declared box on each face: `[{ axis, side, by, at, bound }]` for those over the slack. */
function overhang(body, g) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    if (g.min[i] - body.min[i] > SLACK) out.push({ axis: i, side: 'min', by: g.min[i] - body.min[i], at: body.min[i], bound: g.min[i] });
    if (body.max[i] - g.max[i] > SLACK) out.push({ axis: i, side: 'max', by: body.max[i] - g.max[i], at: body.max[i], bound: g.max[i] });
  }
  return out;
}

/** The part that reaches furthest on a face. */
function outermost(parts, { axis, side }) {
  const solid = parts.map((p, i) => ({ p, i })).filter(v => v.p.box && v.p.kind !== 'lines');
  const best = solid.sort((a, b) => (side === 'max' ? b.p.box.max[axis] - a.p.box.max[axis] : a.p.box.min[axis] - b.p.box.min[axis]))[0];
  return best ? partLabel(best.p, best.i) : 'a part';
}

/** A camera distance from which the whole thing shows, filling about half the picture's height. */
const viewFrom = b => Math.ceil((Math.max(b.max[1] - b.min[1], (b.max[0] - b.min[0]) / 1.78) / 0.52 + (b.max[2] - b.min[2]) / 2) * 2) / 2;

/**
 * Every finding for one scene prefab. `entry` is its registry entry (with `module` and `url`), `file` what to call
 * its module in a finding (`loft/prefabs/lamp.js`). Optional: `source` the module's text, `sceneUrl` the scene
 * folder's URL and `exists(path)` whether a file is in that folder, for the files it names through `assetUrl`.
 */
export async function lintPrefab({ type, entry, file, source = null, sceneUrl = null, exists = async () => true }) {
  const out = [];
  const add = (level, code, path, message, hint = '') => out.push({ level, code, file, path, message, hint });

  if (source != null) {
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    if (/^\s*import\s*(?:[\w{*'"]|$)/m.test(code) || /\brequire\s*\(/.test(code)) {
      add('error', 'PREFAB_SOURCE', '', 'the module imports something', 'a scene prefab is a plain ES module with no imports: take React, three.js and the building blocks from the `sdk` its two exports receive');
    }
  }

  let stage, still;
  try { stage = await openStage(entry); still = await openStage(entry, { reducedMotion: true }); } catch (e) {
    add('error', 'PREFAB_THROWS', 'component', `component(sdk) fails: ${e.message}`);
    await stage?.close();
    return out;
  }
  try {
    const worst = new Map();   // face → the furthest any sample reaches past the declared box
    const note = (key, level, code, path, message, hint) => { if (!worst.has(key)) { worst.set(key, true); add(level, code, path, message, hint); } };
    const contain = (g, when) => {
      const m = stage.measure(), parts = stage.parts();
      if (!m.body || !g) return;
      for (const o of overhang(m.body, g)) {
        const key = `over:${o.axis}:${o.side}`, was = worst.get(key);
        if (!was || o.by > was.by) worst.set(key, { ...o, when, part: outermost(parts, o) });
      }
    };

    for (const sample of sampleProps(entry)) {
      stage.asked.clear();
      if (!(await stage.render(sample.props))) {
        note('throws', 'error', 'PREFAB_THROWS', 'component', `it throws while rendering${sample.with}: ${stage.error?.message ?? 'nothing was rendered'}`);
        continue;
      }
      const m = stage.measure();
      let g = null;
      try { g = entry.geometry?.(sample.props) ?? null; } catch (e) { note('geo-throws', 'error', 'PREFAB_THROWS', 'geometry', `geometry() fails${sample.with}: ${e.message}`); }
      if (!entry.geometry && m.body) {
        const mount = Math.abs(m.body.min[1]) <= SLACK ? 'floor' : Math.abs(m.body.max[1]) <= SLACK ? 'ceiling' : 'free';
        note('missing', 'warn', 'PREFAB_GEO_MISSING', 'geometry', 'the meta declares no `geometry`, so scenes cannot check where this type stands or set it against a wall',
          `with default props its parts measure ${box3(m.body)}; add e.g. geometry: p => ({ ${box3(m.body)}, mount: '${mount}' }) and make it follow the size props`);
      }
      contain(g, sample.with);

      if (g && m.body && !sample.with) {
        // only the defaults are judged for a box that is too generous: one is enough to say so
        for (let i = 0; i < 3; i++) for (const [side, spare] of [['min', m.body.min[i] - g.min[i]], ['max', g.max[i] - m.body.max[i]]]) {
          if (spare > 0.5 && spare > 0.25 * (g.max[i] - g.min[i])) note(`large:${i}:${side}`, 'info', 'PREFAB_GEO_LARGE', 'geometry', `the declared box is ${f(spare)} m larger than its parts on ${side === 'min' ? '−' : '+'}${AXES[i]}`, 'scene checks keep neighbours that much further away than they need be; lines (cables, beams) are not meant to be inside it');
        }
        const low = m.body.min[1], high = m.body.max[1], back = m.body.min[2];
        if (g.mount === 'floor' && (Math.abs(low) > SLACK || Math.abs(g.min[1]) > 1e-3)) note('mount', 'warn', 'PREFAB_MOUNT', 'geometry', `it is declared to stand on the floor, but its lowest part is at y ${f(low)} and its box starts at y ${f(g.min[1])}`, 'a floor object\'s origin is on the floor: its parts and its box start at y 0');
        if (g.mount === 'ceiling' && (Math.abs(high) > SLACK || Math.abs(g.max[1]) > 1e-3)) note('mount', 'warn', 'PREFAB_MOUNT', 'geometry', `it is declared to hang from the ceiling, but its highest part is at y ${f(high)} and its box ends at y ${f(g.max[1])}`, 'a ceiling object\'s origin is on the ceiling: its parts and its box end at y 0');
        if (g.mount === 'wall' && (back < -SLACK || Math.abs(g.min[2]) > 1e-3)) note('mount', 'warn', 'PREFAB_MOUNT', 'geometry', `it is declared to hang on a wall, but its parts start at z ${f(back)} and its box at z ${f(g.min[2])}`, 'a wall object\'s origin is on the wall surface: nothing of it is behind z 0, and it faces +z');
      }

      let declared = null;
      try { declared = entry.hotspots(sample.props); } catch (e) { note('hot-throws', 'error', 'PREFAB_THROWS', 'hotspots', `hotspots() fails${sample.with}: ${e.message}`); }
      if (declared) {
        const asked = [...stage.asked], extra = asked.filter(n => !declared.includes(n)), unused = declared.filter(n => !asked.includes(n));
        if (extra.length) note(`hot+${extra}`, 'warn', 'PREFAB_HOTSPOT', 'hotspots', `a part asks for ${extra.map(n => `"${n}"`).join(', ')}${sample.with}, which the meta's \`hotspots\` does not list (it lists: ${declared.join(', ') || 'none'})`, 'a scene can only bind an action to a listed name: add it to `hotspots`, or drop it from the part');
        if (unused.length) note(`hot-${unused}`, 'warn', 'PREFAB_HOTSPOT', 'hotspots', `the meta lists ${unused.map(n => `"${n}"`).join(', ')}${sample.with}, but no part has that name (parts ask for: ${asked.join(', ') || 'none'})`, 'give a part `hotspot: "<name>"` (or a screen that `id`), or take the name off the list');
      }
    }

    // the defaults once more, to see what is drawn with what and what moves
    if (await stage.render(entry.props)) {
      const parts = stage.parts(), m = stage.measure();
      let g = null;
      try { g = entry.geometry?.(entry.props) ?? null; } catch { /* reported above */ }
      const foreign = parts.map((p, i) => ({ p, i })).filter(v => v.p.foreign);
      if (foreign.length) add('warn', 'PREFAB_MATERIAL', 'component', `${foreign.map(v => partLabel(v.p, v.i)).join(', ')} ${foreign.length === 1 ? 'is' : 'are'} drawn with a material of ${foreign.length === 1 ? 'its' : 'their'} own`, 'use `Solid` and `Segs`, or `useWorld().mats.fills` and `.lines`: then the theme applies and nothing leaks');

      for (const active of [false, true]) {
        if (active && !(await stage.render(entry.props, { active: true }))) break;
        if (!(await stage.frames(240, 1 / 30))) { add('error', 'PREFAB_THROWS', 'component', `a useFrame callback throws: ${stage.error?.message}`); break; }
        contain(g, active ? ' while its stop is shown' : ' while it moves');
      }

      // what the automatic camera of a stop would make of it
      try {
        const hints = entry.placement(entry.props), as = g ?? (m.body && { ...m.body, mount: 'free' });
        if (as) {
          const obj = { type, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, props: entry.props };
          const view = framing(autoPlacement(obj, hints).camera, 55, objectBox(obj, { get: () => ({ geometry: () => as }) }));
          const fix = `a cameraDistance of about ${viewFrom(as)} shows all of it`;
          if (!view.visible || view.cut) add('warn', 'PREFAB_PLACEMENT', 'placement', `a stop's automatic camera, ${hints.cameraDistance} m in front of it, cuts it off`, fix);
          else if (view.cover < 0.01) add('warn', 'PREFAB_PLACEMENT', 'placement', `from a stop's automatic camera, ${hints.cameraDistance} m away, it fills ${f(view.cover * 100)}% of the picture`, fix);
        }
      } catch (e) { add('error', 'PREFAB_THROWS', 'placement', `placement() fails: ${e.message}`); }
    }

    for (const [key, o] of worst) {
      if (!key.startsWith('over:')) continue;
      add('warn', 'PREFAB_GEO_SMALL', 'geometry', `${o.part} reaches ${AXES[o.axis]} ${f(o.at)}${o.when}, ${f(o.by)} m past the declared box (${o.side} ${AXES[o.axis]} ${f(o.bound)})`, 'make `geometry` contain every solid part for every prop: scene checks and placement by wall trust it');
    }

    // nothing may move on its own for a visitor who asked for less motion
    if (await still.render(entry.props)) {
      const before = still.snapshot(), parts = still.parts();
      if (await still.frames(30, 1 / 30)) {
        const moving = moved(before, still.snapshot(), parts);
        if (moving.length) add('warn', 'PREFAB_MOTION', 'component', `${[...new Set(moving.map(p => partLabel(p, parts.indexOf(p))))].join(', ')} still move${moving.length === 1 ? 's' : ''} with reduced motion`, 'leave `useFrame` early when `reducedMotion` is true');
      }
    }

    for (const text of [...new Set([...stage.messages, ...still.messages])].slice(0, 4)) add('warn', 'PREFAB_REACT', 'component', text.length > 220 ? `${text.slice(0, 217)}…` : text);
    for (const text of stage.notes) add('info', 'PREFAB_UNMEASURED', 'component', text);
    if (sceneUrl) {
      for (const rel of stage.assets) {
        const href = new URL(rel, entry.url).href;
        if (href.startsWith(sceneUrl) && !(await exists(decodeURIComponent(href.slice(sceneUrl.length))))) add('error', 'PREFAB_ASSET', 'component', `it names "${rel}" through assetUrl, which is not next to the module`, 'add the file, or correct the path (it is relative to the module)');
      }
    }
    const plain = ['title', 'blurb', 'glyph'].filter(k => entry[k] == null);
    if (plain.length) add('info', 'PREFAB_UNTITLED', '', `the meta gives no ${plain.join(', ')}`, 'the editor\'s Add palette and a catalog then show the bare type name');
  } finally {
    await stage.close();
    await still.close();
  }
  return out;
}
