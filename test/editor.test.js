import { describe, it, expect } from 'vitest';
import { makeZip, crc32 } from '../src/editor/zip.js';
import { newSceneFiles, addPoi, addObject, objectTemplate, slug } from '../src/editor/bundle.js';
import { buildScene, readerFromMap } from '../src/config/buildScene.js';
import { z } from 'zod';
import { PREFAB_TYPES, createRegistry, normalisePrefab } from '../src/prefabs/registry.js';

const build = files => buildScene({ name: 't', read: readerFromMap(files), resolveUrl: p => p });

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes local headers, a central directory and the end record', () => {
    const z = makeZip(new Map([['a.txt', 'hello'], ['dir/b.json', '{}']]), { prefix: 'p/', now: new Date(2026, 0, 2, 3, 4, 6) });
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(18, true)).toBe(5); // size of "hello"
    const nameLen = dv.getUint16(26, true);
    expect(new TextDecoder().decode(z.slice(30, 30 + nameLen))).toBe('p/a.txt');
    const endAt = z.length - 22;
    expect(dv.getUint32(endAt, true)).toBe(0x06054b50);
    expect(dv.getUint16(endAt + 10, true)).toBe(2); // entries
    const cdOffset = dv.getUint32(endAt + 16, true);
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(dv.getUint32(cdOffset + 42, true)).toBe(0); // first local header offset
  });
});

describe('bundle templates', () => {
  it('a new scene builds', async () => {
    const { scene, pois } = await build(newSceneFiles('Test Room'));
    expect(scene.title).toBe('Test Room');
    expect(pois.map(p => p.id)).toEqual(['start']);
  });

  it('addPoi adds a file, its markdown and the scene entry, with unique ids', async () => {
    let r = addPoi(newSceneFiles(), 'North wall', 'pictureFrame');
    expect(r.file).toBe('poi/north-wall.json');
    r = addPoi(r.files, 'North wall', 'desk');
    expect(r.file).toBe('poi/north-wall-2.json');
    const { pois } = await build(r.files);
    expect(pois.map(p => p.id)).toEqual(['start', 'north-wall', 'north-wall-2']);
    expect(pois[2].objects[0].type).toBe('desk');
  });

  it('addObject appends to a POI or to decor and the result builds', async () => {
    let files = addObject(newSceneFiles(), 'poi/start.json', 'bench');
    files = addObject(files, 'scene.json', 'door');
    const { scene, pois } = await build(files);
    expect(pois[0].objects.map(o => o.type)).toEqual(['pedestal', 'bench']);
    expect(scene.decor[0].type).toBe('door');
  });

  it.each(PREFAB_TYPES)('objectTemplate(%s) validates', async type => {
    const files = addObject(newSceneFiles(), 'poi/start.json', type);
    await expect(build(files)).resolves.toBeTruthy();
    expect(objectTemplate(type).props).toBeDefined();
  });

  it('slug makes url-safe ids', () => {
    expect(slug('North Wall!')).toBe('north-wall');
    expect(slug('***')).toBe('item');
  });
});

describe('templates with a scene registry', () => {
  it('objectTemplate and addObject use the scene prefab\'s defaults', async () => {
    const lamp = normalisePrefab('lamp', {
      schema: z.strictObject({ height: z.number().positive().default(1.8) }),
      placement: p => ({ focus: [0, p.height, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
    });
    const registry = createRegistry({ lamp });
    expect(objectTemplate('lamp', registry).props).toEqual({ height: 1.8 });
    expect(() => objectTemplate('lamp')).toThrow();
    const files = addObject(newSceneFiles(), 'scene.json', 'lamp', registry);
    files.set('scene.json', files.get('scene.json').replace('"decor"', '"prefabs": { "lamp": "prefabs/lamp.js" },\n  "decor"'));
    const { scene } = await buildScene({ name: 't', read: readerFromMap(files), resolveUrl: p => p, loadModule: async () => ({ meta: () => lamp }) });
    expect(scene.decor[0]).toMatchObject({ type: 'lamp', props: { height: 1.8 } });
  });
});
