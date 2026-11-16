import { z } from 'zod';
import { atSchema, objectSchema, poiSchema, sceneSchema } from '../config/schema.js';
import { SCENE_DEFAULTS } from '../config/defaults.js';
import { ACTIONS } from '../actions/registry.js';
import { BLOCK_DATA, FEED_BLOCKS } from '../ui/blocks/schema.js';
import { screenSchema } from '../prefabs/screenSchema.js';
import { EXPECTATIONS } from './expect.js';

/**
 * Every key a scene's files can hold, printed from the schemas that validate them (`node tools/scene.js keys`):
 * the type, the default and a line of meaning, which is the key's `.describe()` text in the schema. Nothing here
 * is written by hand twice, so it cannot drift from what the loader accepts; test/keys.test.js also checks that
 * the reference pages in the operator guide mention every key listed here.
 */

const json = schema => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

/** A JSON Schema node as a short type: `number > 0`, `"wave" | "bars"`, `[number, number]`, `string[]`. */
export function typeText(s) {
  if (!s || typeof s !== 'object') return 'any';
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ');
  if (s.anyOf) return [...new Set(s.anyOf.map(typeText))].join(' | ');
  if (Array.isArray(s.type)) return s.type.join(' | ');
  if (s.type === 'array') {
    if (s.prefixItems) return `[${s.prefixItems.map(typeText).join(', ')}]`;
    const item = typeText(s.items);
    return `${/[ |]/.test(item) ? `(${item})` : item}[]`;
  }
  // a small object shows its keys; a large one (an object, an `at`) has a section of its own
  if (s.type === 'object') return s.properties && Object.keys(s.properties).length <= 6 ? `{ ${Object.keys(s.properties).map(k => (s.required?.includes(k) ? k : `${k}?`)).join(', ')} }` : 'object';
  if (s.type === 'number' || s.type === 'integer') {
    const range = [s.exclusiveMinimum != null && `> ${s.exclusiveMinimum}`, s.minimum != null && `≥ ${s.minimum}`, s.maximum != null && s.maximum < Number.MAX_SAFE_INTEGER && `≤ ${s.maximum}`].filter(Boolean).join(', ');
    return `${s.type}${range ? ` ${range}` : ''}`;
  }
  return s.type ?? 'any';
}

const shown = v => {
  const text = JSON.stringify(v);
  return text.length > 64 ? `${text.slice(0, 61)}…` : text;
};

/** One key as a line: `  width: number > 0 = 30 — metres east–west …`. */
function line(key, node, def, required) {
  const value = def !== undefined ? def : node?.default;
  return `  ${key}${required ? ' (required)' : ''}: ${typeText(node)}${value !== undefined ? ` = ${shown(value)}` : ''}${node?.description ? ` — ${node.description}` : ''}`;
}

/** The keys of an object schema node as lines, nested objects flattened into `grid.floor`; `defaults` are the values at those keys. */
function lines(node, defaults = {}, prefix = '') {
  const out = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const def = defaults?.[key];
    // a plain nested section (not a map, not one that also takes a string or null): list its keys instead
    if (child.type === 'object' && child.properties && !child.description) out.push(...lines(child, def, `${prefix}${key}.`));
    else out.push(line(`${prefix}${key}`, child, def, node.required?.includes(key) && def === undefined && child.default === undefined));
  }
  return out;
}

const scene = () => json(sceneSchema);
const section = name => () => [`scene.json › ${name}`, ...lines(scene().properties[name], SCENE_DEFAULTS[name])];

/** The sections `keys` knows, each a title and a function that gives its lines. */
export const SECTIONS = {
  scene: {
    title: 'the top level of scene.json; what you give is merged over the defaults',
    text: () => {
      const node = scene(), sub = ['room', 'theme', 'camera', 'effects', 'multiplayer'];
      return ['scene.json', ...Object.entries(node.properties).map(([key, child]) => (sub.includes(key)
        ? `  ${key}: object — see \`keys ${key}\``
        : line(key, key === 'ui' ? { type: 'object', description: child.description } : child, key === 'ui' ? undefined : SCENE_DEFAULTS[key], key === 'poi')))];
    },
  },
  room: { title: 'the room: size or outline, grids, pillars, lights', text: section('room') },
  theme: { title: 'colours, fog, fonts, hatching', text: section('theme') },
  camera: { title: 'view angle, the first flight, where the page opens', text: section('camera') },
  effects: { title: 'flight curve, parallax, particles, markers', text: section('effects') },
  multiplayer: { title: 'the shared event', text: section('multiplayer') },
  ui: {
    title: 'every interface text, to translate',
    text: () => ['scene.json › ui (each a string; {n}, {total}, {label}, {keys} are filled in)', ...Object.entries(SCENE_DEFAULTS.ui).map(([k, v]) => `  ${k} = ${shown(v)}`)],
  },
  poi: { title: 'a stop file, poi/<id>.json', text: () => ['poi/<id>.json', ...lines(json(poiSchema))] },
  object: { title: 'an object, in a stop\'s `objects` or in scene.json › decor', text: () => ['an object', ...lines(json(objectSchema))] },
  at: {
    title: 'where an object stands, in words',
    text: () => ['object › at: one of four forms, named by the key that leads it; "height" goes with all of them', ...lines(json(atSchema)),
      '  an object refers to another by that one\'s "name"; `facing` (a key of the object, beside `at`) turns it'],
  },
  actions: {
    title: 'what a click on a part of an object does',
    text: () => ['object › actions › "<clickable part>": one of', ...Object.entries(ACTIONS).map(([type, a]) => {
      const node = json(a.schema), keys = Object.entries(node.properties).filter(([k]) => k !== 'type');
      return `  { "type": "${type}"${keys.map(([k, c]) => `, "${k}"${node.required?.includes(k) ? '' : '?'}: ${typeText(c)}`).join('')} } — ${node.description}`;
    }), '  the clickable parts of each type: `node tools/scene.js prefabs`'],
  },
  blocks: {
    title: 'what a panel shows',
    text: () => ['poi › content: { "markdown": "content/<id>.md" }, or { "blocks": [ … ] } with any of',
      '  { "type": "markdown", "text": string } — GitHub-flavoured Markdown; a fenced block named after one of the types below draws that block from its JSON body',
      '  { "type": "heading", "text": string } — the panel\'s title, typed out',
      ...Object.entries(BLOCK_DATA).map(([type, schema]) => {
        const node = json(schema);
        return `  { "type": "${type}", "data": ${typeText(node)}${FEED_BLOCKS.includes(type) ? ', "feed"?: a URL or { url, refresh, stream, transform }' : ''} } — ${node.description}`;
      })],
  },
  screen: {
    title: 'a screen of a desk, control desk or cinema screen',
    text: () => ['a screen config (desk › props.screen, controlDesk › props.screens[], cinemaScreen › props.screen); each key names the sources that read it', ...lines(json(screenSchema))],
  },
  brief: {
    title: 'brief.json: the description and what must be true of the scene',
    text: () => ['brief.json: { "text": "<the description the scene was built from>", "expect": [ … ] }; X, Y are objects\' "name"s, S a stop\'s id',
      ...EXPECTATIONS.map(f => `  ${f.form} — ${f.says}`),
      '  `node tools/scene.js check <scene>` reports each one that does not hold'],
  },
};

/** The lines for one section, or the list of sections when none (or an unknown one) is named. */
export function keysText(name) {
  if (name && Object.hasOwn(SECTIONS, name)) return SECTIONS[name].text();
  return ['sections (node tools/scene.js keys <section>):', ...Object.entries(SECTIONS).map(([k, s]) => `  ${k.padEnd(11)} ${s.title}`)];
}

/** Every key a section lists, as written in its lines (`grid.floor`), for the tests. */
export const keysOf = name => SECTIONS[name].text().slice(1).map(l => /^ {2}([\w.]+)(?: \(required\))?: /.exec(l)?.[1]).filter(Boolean);
