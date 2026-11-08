import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCatalog, isCatalogUrl } from '../src/editor/catalog.js';

const at = 'https://cdn.example/acme/catalog.json';
const doc = o => JSON.stringify(o);

describe('prefab catalogs', () => {
  it('isCatalogUrl goes by the extension', () => {
    expect(isCatalogUrl('https://h/x/catalog.json')).toBe(true);
    expect(isCatalogUrl('https://h/x/catalog.json?v=2#top')).toBe(true);
    expect(isCatalogUrl('https://h/x/kiosk.js')).toBe(false);
    expect(isCatalogUrl('https://h/x/kiosk.js?v=json')).toBe(false);
  });

  it('parses a catalog and resolves module URLs against it', () => {
    const c = parseCatalog(doc({ roomkit: 1, title: ' Acme ', prefabs: [
      { type: 'kiosk', url: 'kiosk@1.2.0.js', title: 'Kiosk', blurb: 'a kiosk', glyph: '▮' },
      { type: 'plant', url: '../shared/plant.js' },
      { type: 'sign', url: 'https://other.example/sign.js' },
    ] }), at);
    expect(c.title).toBe('Acme');
    expect(c.prefabs).toEqual([
      { type: 'kiosk', url: 'https://cdn.example/acme/kiosk@1.2.0.js', title: 'Kiosk', blurb: 'a kiosk', glyph: '▮' },
      { type: 'plant', url: 'https://cdn.example/shared/plant.js' },
      { type: 'sign', url: 'https://other.example/sign.js' },
    ]);
    expect(parseCatalog(doc({ roomkit: 1, prefabs: [{ type: 'a', url: 'a.js' }] }), at).title).toBeNull();
  });

  it.each([
    ['{', /not valid JSON/],
    ['[]', /a catalog is a JSON object/],
    [doc({ prefabs: [] }), /"roomkit" must be 1 \(the catalog format this editor reads\)$/],
    [doc({ roomkit: 2, prefabs: [] }), /"roomkit" must be 1 .*, not 2/],
    [doc({ roomkit: 1 }), /"prefabs" must be a list with at least one entry/],
    [doc({ roomkit: 1, prefabs: [] }), /"prefabs" must be a list with at least one entry/],
    [doc({ roomkit: 1, prefabs: ['x'] }), /prefabs\.0: must be an object/],
    [doc({ roomkit: 1, prefabs: [{ type: 'Kiosk', url: 'k.js' }] }), /prefabs\.0\.type: a type name is letters/],
    [doc({ roomkit: 1, prefabs: [{ type: 'k', url: 'k.js' }, { type: 'k', url: 'k2.js' }] }), /prefabs\.1\.type: "k" is listed twice/],
    [doc({ roomkit: 1, prefabs: [{ type: 'k' }] }), /prefabs\.0\.url: give the module's URL/],
    [doc({ roomkit: 1, prefabs: [{ type: 'k', url: 'k.js', glyph: 'kiosk' }] }), /prefabs\.0\.glyph: one or two characters/],
    [doc({ roomkit: 1, prefabs: [{ type: 'k', url: 'k.js', title: 3 }] }), /prefabs\.0\.title: must be a non-empty string/],
  ])('rejects %s', (text, re) => {
    expect(() => parseCatalog(text, at)).toThrow(re);
  });

  it('the shipped sample catalog parses and names the lamp and the projector', () => {
    const base = 'http://localhost:5180/scenes/loft/prefabs/catalog.json';
    const c = parseCatalog(readFileSync('public/scenes/loft/prefabs/catalog.json', 'utf8'), base);
    expect(c.prefabs.map(p => [p.type, p.url])).toEqual([
      ['lamp', 'http://localhost:5180/scenes/loft/prefabs/lamp.js'],
      ['projector', 'http://localhost:5180/scenes/cinema/prefabs/projector.js'],
    ]);
  });
});
