import { describe, it, expect } from 'vitest';
import { blockSchema, parseBlockData, BLOCK_TYPES } from '../src/ui/blocks/schema.js';
import { screenSchema, screenOrSource } from '../src/prefabs/screenSchema.js';

describe('blockSchema', () => {
  it('normalises text blocks to { type, text }', () => {
    expect(blockSchema.parse({ type: 'markdown', data: 'x' })).toEqual({ type: 'markdown', text: 'x' });
    expect(blockSchema.parse({ type: 'heading', text: 'H' })).toEqual({ type: 'heading', text: 'H' });
  });

  it('validates data per type and rejects unknown types', () => {
    expect(blockSchema.safeParse({ type: 'stats', data: [{ value: 1 }] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'quote', data: {} }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'form', data: { fields: [{ name: 'a', type: 'date' }] } }).success).toBe(false);
    const r = blockSchema.parse({ type: 'form', data: { fields: [{ name: 'a' }] } });
    expect(r.data.fields[0].type).toBe('text');
  });

  it('a form field may ask the browser for contact details, never for cards or passwords', () => {
    const form = fields => blockSchema.safeParse({ type: 'form', data: { fields } }).success;
    expect(form([{ name: 'n', autocomplete: 'name' }, { name: 'e', type: 'email', autocomplete: 'email' }, { name: 'o', autocomplete: 'off' }])).toBe(true);
    expect(form([{ name: 'c', autocomplete: 'cc-number' }])).toBe(false);
    expect(form([{ name: 'p', autocomplete: 'current-password' }])).toBe(false);
    expect(form([{ name: 'p', autocomplete: 'one-time-code' }])).toBe(false);
  });

  it('lists every type', () => {
    expect(BLOCK_TYPES).toEqual(['markdown', 'heading', 'stats', 'cards', 'list', 'timeline', 'form']);
  });
});

describe('parseBlockData', () => {
  it('returns parsed data or issues', () => {
    expect(parseBlockData('list', [{ title: 'a' }])).toEqual({ ok: true, data: [{ title: 'a' }] });
    const r = parseBlockData('list', [{ titel: 'a' }]);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
    expect(parseBlockData('unknown', 1)).toEqual({ ok: true, data: 1 });
  });
});

describe('screenSchema', () => {
  it('defaults to clickable rain and rejects unknown keys and sources', () => {
    expect(screenSchema.parse({})).toEqual({ source: 'rain', zoom: true });
    expect(screenSchema.safeParse({ source: 'hologram' }).success).toBe(false);
    expect(screenSchema.safeParse({ titel: 'x' }).success).toBe(false);
    expect(screenSchema.parse({ source: 'graph', graph: 'radar', lines: [1, 'a'] }).lines).toEqual(['1', 'a']);
  });

  it('screenOrSource accepts a bare name or a config', () => {
    expect(screenOrSource.parse('video')).toEqual({ source: 'video', zoom: true });
    expect(screenOrSource.parse({ source: 'text', title: 'T' })).toMatchObject({ source: 'text', title: 'T' });
  });
});
