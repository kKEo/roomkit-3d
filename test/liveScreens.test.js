import { describe, it, expect } from 'vitest';
import { mergeLive } from '../src/data/live.js';
import { keepTyped, valueRange, scaleSeries, graphReadout, statsGrid } from '../src/scene/screens.js';
import { deltaDirection, blockSchema } from '../src/ui/blocks/schema.js';
import { screenSchema } from '../src/prefabs/screenSchema.js';

const ok = value => ({ status: 'ok', value, error: null, at: 1 });
const allow = url => url;

describe('mergeLive', () => {
  const config = { source: 'dashboard', title: 'Static', value: 'load', feed: { url: 'data/n.json' } };

  it('leaves a screen without a feed alone, marked static', () => {
    const plain = { source: 'text', lines: ['a'] };
    expect(mergeLive(plain, ok({ lines: ['b'] }), null, allow)).toEqual({ config: plain, status: 'static', error: null });
  });

  it('shows the static fields until a value arrives, with the feed status', () => {
    expect(mergeLive(config, { status: 'loading', value: undefined, error: null }, null, allow)).toMatchObject({ config, status: 'loading' });
  });

  it('merges the value over the static fields', () => {
    const r = mergeLive(config, ok({ title: 'Live', rows: [{ n: 'a', load: 1 }] }), null, allow);
    expect(r.status).toBe('ok');
    expect(r.config).toMatchObject({ source: 'dashboard', title: 'Live', value: 'load', rows: [{ n: 'a', load: 1 }] });
  });

  it('keeps the last value but reports a stale error', () => {
    const r = mergeLive(config, { status: 'error', value: { title: 'Old' }, error: 'HTTP 503' }, null, allow);
    expect(r).toMatchObject({ status: 'error', error: 'HTTP 503', config: { title: 'Old' } });
  });

  it('a value that is not screen fields is an error and the static config shows', () => {
    const r = mergeLive(config, ok({ titel: 'typo' }), null, allow);
    expect(r.status).toBe('error');
    expect(r.error).toContain('not screen fields');
    expect(r.config).toBe(config);
    expect(mergeLive(config, ok({ source: 'text' }), null, allow).status).toBe('error');
  });

  it('validates every snapshot, even when a transform hands back the same (mutated) object', () => {
    const value = { title: 'v1' };
    expect(mergeLive(config, ok(value), null, allow).config.title).toBe('v1');
    value.title = 'v2';
    expect(mergeLive(config, ok(value), null, allow).config.title).toBe('v2');
    value.bogus = 1;
    expect(mergeLive(config, ok(value), null, allow).status).toBe('error');
  });

  it('a feed may change a form\'s fields but never where it submits', () => {
    const form = { source: 'form', feed: { url: 'x' }, form: { fields: [{ name: 'a' }], submit: 'Go', action: 'https://me.example/in' } };
    const r = mergeLive(form, ok({ form: { fields: [{ name: 'b', label: 'B' }] } }), null, allow);
    expect(r.status).toBe('ok');
    expect(r.config.form).toEqual({ fields: [{ name: 'b', label: 'B', type: 'text' }], submit: 'Go', action: 'https://me.example/in' });
    // an action in the value is a shape error (the static config shows), not a new destination
    const bad = mergeLive(form, ok({ form: { fields: [], action: 'https://evil.example/c' } }), null, allow);
    expect(bad.status).toBe('error');
    expect(bad.config).toBe(form);
    // a form without an action stays a prototype whatever the feed sends
    const proto = { source: 'form', feed: { url: 'x' }, form: { fields: [] } };
    expect(mergeLive(proto, ok({ form: { fields: [{ name: 'c' }] } }), null, allow).config.form.action).toBeUndefined();
  });

  it('resolves a relative src against the feed URL and applies the guard', () => {
    const img = { source: 'image', feed: { url: 'x' } };
    expect(mergeLive(img, ok({ src: 'pics/a.png' }), 'https://api.example/feeds/now.json', allow).config.src).toBe('https://api.example/feeds/pics/a.png');
    const r = mergeLive(img, ok({ src: 'https://evil.example/a.png', title: 'T' }), null, () => { throw new Error('blocked'); });
    expect(r).toMatchObject({ status: 'error', error: 'blocked', config: { title: 'T' } });
    expect(r.config.src).toBeUndefined();
  });
});

describe('screen drawing helpers', () => {
  it('keepTyped keeps progress while text grows and restarts otherwise', () => {
    expect(keepTyped('a\nb', 'a\nb\nc', 3, 6, false)).toBe(3);
    expect(keepTyped('a\nb', 'x', 3, 2, false)).toBe(0);
    expect(keepTyped('a\nb', 'x', 3, 2, true)).toBe(2);
  });

  it('valueRange uses min/max, else the data range (bars from zero)', () => {
    expect(valueRange([2, 4, 6])).toEqual([2, 6]);
    expect(valueRange([2, 4, 6], {}, true)).toEqual([0, 6]);
    expect(valueRange([2, 4], { min: 0, max: 10 })).toEqual([0, 10]);
    expect(valueRange([3, 3])).toEqual([3, 4]);
  });

  it('scaleSeries maps into 0–1 and clamps', () => {
    expect(scaleSeries([0, 5, 10, 20], [0, 10])).toEqual([0, 0.5, 1, 1]);
  });

  it('graphReadout prefers readout, else latest, mean or contacts', () => {
    expect(graphReadout('wave', { values: [1, 2.25], readout: 'OK' })).toBe('OK');
    expect(graphReadout('wave', { values: [1, 2.25] })).toBe('2.3');
    expect(graphReadout('bars', { values: [1, 3] })).toBe('2');
    expect(graphReadout('radar', { points: [{}, {}] })).toBe('2 contacts');
  });

  it('statsGrid: one row up to four, then two rows', () => {
    expect([1, 3, 4, 5, 8].map(statsGrid)).toEqual([
      { cols: 1, rows: 1 }, { cols: 3, rows: 1 }, { cols: 4, rows: 1 }, { cols: 3, rows: 2 }, { cols: 4, rows: 2 },
    ]);
  });

  it('deltaDirection reads signs and numbers', () => {
    expect(['+4%', '-2', '−1.5', 3, -1, '0', 'n/a'].map(deltaDirection)).toEqual(['up', 'down', 'down', 'up', 'down', 'flat', 'flat']);
  });
});

describe('graph and stats screen fields', () => {
  it('a graph takes values, points, a range and a readout; stats a list of numbers', () => {
    const g = screenSchema.parse({ source: 'graph', graph: 'radar', points: [{ angle: 45, distance: 0.5, label: 'X' }], min: 0, max: 1, readout: 7 });
    expect(g.readout).toBe('7');
    const s = screenSchema.parse({ source: 'stats', stats: [{ value: 99.9, label: 'Uptime', unit: '%', delta: '+0.1' }] });
    expect(s.stats[0]).toEqual({ value: '99.9', label: 'Uptime', unit: '%', delta: '+0.1' });
  });

  it('a colour is a hex, rgb()/hsl() or a name, nothing a feed could smuggle into a style', () => {
    for (const c of ['#ffb000', '#FFF', '#b80f7c80', 'rgb(255, 176, 0)', 'rgba(0,16,7,.74)', 'hsl(40 100% 50% / 0.5)', 'transparent', 'rebeccapurple']) {
      expect(screenSchema.safeParse({ color: c }).success, c).toBe(true);
    }
    for (const c of ['red; background: url(https://x/t)', 'url(x)', 'var(--y)', '#ggg', 'rgb(1,2,3) !important', '']) {
      expect(screenSchema.safeParse({ color: c }).success, c).toBe(false);
    }
  });

  it('rejects radar points outside the circle and more than 8 stats', () => {
    expect(screenSchema.safeParse({ source: 'graph', points: [{ angle: 0, distance: 2 }] }).success).toBe(false);
    expect(screenSchema.safeParse({ source: 'stats', stats: Array.from({ length: 9 }, () => ({ value: 1, label: 'a' })) }).success).toBe(false);
  });

  it('the stats block takes delta and unit too', () => {
    expect(blockSchema.parse({ type: 'stats', data: [{ value: 3, label: 'a', delta: -1, unit: 'ms' }] }).data[0]).toEqual({ value: '3', label: 'a', delta: '-1', unit: 'ms' });
  });
});

describe('isHls', () => {
  it('spots .m3u8 URLs, with or without a query', async () => {
    const { isHls } = await import('../src/prefabs/screenSchema.js');
    expect(['live/index.m3u8', 'https://cdn/x.M3U8?token=1', 'a.m3u8#t'].every(isHls)).toBe(true);
    expect(['movie.mp4', 'x.m3u8.mp4', null].some(isHls)).toBe(false);
  });
});
