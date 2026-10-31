import { describe, it, expect } from 'vitest';
import { feedSchema, isFeed, FEED } from '../src/data/feedSchema.js';
import { screenSchema, liveScreenSchema } from '../src/prefabs/screenSchema.js';
import { blockSchema, feedBlockSchema } from '../src/ui/blocks/schema.js';

describe('feedSchema', () => {
  it('turns a URL string into { url } and tags the result', () => {
    const f = feedSchema.parse('data/a.json');
    expect(f).toMatchObject({ url: 'data/a.json' });
    expect(f[FEED]).toBe(true);
    expect(isFeed(f)).toBe(true);
    expect(isFeed({ url: 'x' })).toBe(false);
  });

  it('accepts url and/or stream, refresh in seconds and a transform name', () => {
    expect(feedSchema.parse({ stream: 's' })).toMatchObject({ stream: 's' });
    expect(feedSchema.parse({ url: 'u', stream: 's', refresh: 5, transform: 'nodes' })).toMatchObject({ url: 'u', stream: 's', refresh: 5, transform: 'nodes' });
  });

  it.each([
    [{ refresh: 5 }, 'give url and/or stream'],
    [{ url: 'u', refresh: 0.5 }, 'refresh is in seconds, at least 1'],
    [{ url: 'u', transform: 'Nodes' }, 'a transform name'],
    [{ url: 'u', every: 5 }, 'Unrecognized key'],
    ['', ''],
  ])('rejects %j', (input, message) => {
    const r = feedSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error.issues.map(i => i.message).join(' ')).toContain(message);
  });
});

describe('feeds on screens and blocks', () => {
  it('a screen may carry a feed', () => {
    expect(screenSchema.parse({ source: 'dashboard', feed: 'd.json' }).feed).toMatchObject({ url: 'd.json' });
  });

  it('liveScreenSchema takes any screen field but source, feed, id and zoom, and stays strict', () => {
    expect(liveScreenSchema.parse({ title: 'T', rows: [{ a: 1 }] })).toEqual({ title: 'T', rows: [{ a: 1 }] });
    for (const bad of [{ source: 'text' }, { feed: 'x' }, { id: 'a' }, { zoom: false }, { titel: 'T' }]) {
      expect(liveScreenSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('a feed block needs data, feed or both; form still needs data', () => {
    expect(blockSchema.parse({ type: 'stats', feed: 'k.json' })).toMatchObject({ type: 'stats', feed: { url: 'k.json' } });
    expect(blockSchema.parse({ type: 'list', data: [{ title: 'a' }], feed: 'l.json' }).data).toEqual([{ title: 'a' }]);
    expect(blockSchema.safeParse({ type: 'cards' }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'form', feed: 'f.json' }).success).toBe(false);
  });

  it('feedBlockSchema validates the JSON body of a fenced feed block', () => {
    expect(feedBlockSchema('stats').parse({ feed: 'k.json', data: [{ value: 1, label: 'a' }] })).toMatchObject({ data: [{ value: '1', label: 'a' }] });
    expect(feedBlockSchema('stats').safeParse({ data: [] }).success).toBe(false);
    expect(feedBlockSchema('stats').safeParse({ feed: 'k.json', extra: 1 }).success).toBe(false);
  });
});
