import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SECTIONS, keysText, keysOf, typeText } from '../src/lint/keys.js';
import { EXPECTATIONS } from '../src/lint/expect.js';
import { ACTION_TYPES } from '../src/actions/registry.js';
import { BLOCK_TYPES } from '../src/ui/blocks/schema.js';
import { SCENE_DEFAULTS } from '../src/config/defaults.js';

const page = name => readFile(join(import.meta.dirname, '..', 'docs', 'guide', 'operator', 'reference', name), 'utf8');

describe('keys: every key of a scene\'s files, printed from the schemas', () => {
  it('lists the sections, and falls back to that list for a name it does not have', () => {
    const index = keysText();
    expect(index[0]).toBe('sections (node tools/scene.js keys <section>):');
    expect(index.slice(1).map(l => l.trim().split(/\s+/)[0])).toEqual(Object.keys(SECTIONS));
    expect(keysText('nope')).toEqual(index);
  });

  it('prints a key as its type, its default and what it does', () => {
    const room = keysText('room');
    expect(room[0]).toBe('scene.json › room');
    expect(room).toContain('  width: number > 0 = 30 — metres east–west (x); the room is centred on the origin. Ignored when footprint is given');
    expect(room).toContain('  grid.floor: number ≥ 0 = 1.5 — floor grid spacing in metres; 0 = none');
    expect(keysText('poi')).toContain('  id (required): string — unique in the scene; the #hash in the address, and what goTo actions name');
    expect(keysText('effects').find(l => l.includes('ease'))).toBe('  ease: "quint" | "expo" | "back" | "sine" | "linear" = "quint" — the curve of flights between stops');
    expect(keysText('at').find(l => l.trimStart().startsWith('wall'))).toMatch(/^ {2}wall: integer ≥ 0 \| string — form 1, on or against a wall: a compass side/);
  });

  it.each(['room', 'theme', 'camera', 'effects', 'multiplayer', 'poi', 'object', 'at', 'screen'])('%s: every key says what it does', name => {
    const lines = keysText(name).slice(1).filter(l => /^ {2}[\w.]+( \(required\))?: /.test(l));
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l, l).toMatch(/ — \S.{8,}/);
  });

  it('covers every section of the defaults, every action, block and expectation', () => {
    expect(keysOf('scene')).toEqual(expect.arrayContaining(Object.keys(SCENE_DEFAULTS)));
    for (const s of ['room', 'theme', 'camera', 'effects', 'multiplayer']) {
      const top = new Set(keysOf(s).map(k => k.split('.')[0]));
      for (const k of Object.keys(SCENE_DEFAULTS[s])) expect(top.has(k), `${s}.${k}`).toBe(true);
    }
    expect(keysText('ui').length - 1).toBe(Object.keys(SCENE_DEFAULTS.ui).length);
    const actions = keysText('actions').join('\n'), blocks = keysText('blocks').join('\n'), brief = keysText('brief').join('\n');
    for (const t of ACTION_TYPES) expect(actions).toContain(`"type": "${t}"`);
    for (const t of BLOCK_TYPES) expect(blocks).toContain(`"type": "${t}"`);
    for (const f of EXPECTATIONS) expect(brief).toContain(f.form);
  });

  it('a section stays small enough to read in one go', () => {
    for (const name of Object.keys(SECTIONS)) expect(keysText(name).join('\n').length, name).toBeLessThan(name === 'ui' ? 4500 : 2600);
  });

  it('typeText: enums, ranges, tuples, lists, small and large objects', () => {
    expect(typeText({ type: 'number', exclusiveMinimum: 0 })).toBe('number > 0');
    expect(typeText({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null');
    expect(typeText({ type: 'array', items: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }] } })).toBe('([number, number])[]');
    expect(typeText({ type: 'array', items: { type: ['string', 'number'] } })).toBe('(string | number)[]');
    expect(typeText({ type: 'object', properties: { a: {}, b: {} }, required: ['a'] })).toBe('{ a, b? }');
    expect(typeText({ type: 'object', properties: Object.fromEntries('abcdefg'.split('').map(k => [k, {}])) })).toBe('object');
    expect(typeText(undefined)).toBe('any');
  });
});

describe('the reference pages keep up with the schemas', () => {
  it('scene.json reference mentions every key of every section', async () => {
    const text = await page('scene-json.md');
    for (const s of ['scene', 'room', 'theme', 'camera', 'effects', 'multiplayer']) {
      for (const key of keysOf(s)) {
        // `overview` is documented by its two parts
        const names = key === 'overview' ? ['overview.position', 'overview.target'] : [key];
        for (const n of names) expect(text.includes(`\`${n}\``), `${s}: ${n} is missing from scene-json.md`).toBe(true);
      }
    }
  });

  it('POI reference mentions every key of a stop, an object and `at`', async () => {
    const text = await page('poi-json.md');
    for (const s of ['poi', 'object', 'at']) for (const key of keysOf(s)) expect(text.includes(`\`${key}\``), `${s}: ${key} is missing from poi-json.md`).toBe(true);
  });

  it('brief reference shows every form of expectation', async () => {
    const text = await page('brief-json.md');
    for (const f of EXPECTATIONS) expect(text.includes(`"${f.lead}"`), `"${f.lead}" is missing from brief-json.md`).toBe(true);
  });
});
