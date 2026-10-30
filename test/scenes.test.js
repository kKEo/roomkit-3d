import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildScene } from '../src/config/buildScene.js';
import { SCENE_NAME } from '../src/config/loadScene.js';

/**
 * Every scene shipped in public/scenes/ must build: this is the config test suite.
 * It uses the same buildScene the browser does, reading from disk instead of over HTTP.
 */
const ROOT = join(import.meta.dirname, '..', 'public', 'scenes');

const readerFromDir = dir => async path => {
  try { return await readFile(join(dir, path), 'utf8'); } catch (e) { throw new Error(e.code === 'ENOENT' ? 'file not found' : e.message); }
};

const index = JSON.parse(await readFile(join(ROOT, 'index.json'), 'utf8'));
const dirs = (await readdir(ROOT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);

describe('public/scenes/index.json', () => {
  it('lists every scene folder and names an existing default', () => {
    expect([...index.scenes].sort()).toEqual([...dirs].sort());
    expect(index.scenes).toContain(index.default);
    for (const n of index.scenes) expect(n).toMatch(SCENE_NAME);
  });
});

describe.each(dirs)('scene %s', name => {
  it('builds without config errors', async () => {
    const { scene, pois } = await buildScene({ name, read: readerFromDir(join(ROOT, name)), resolveUrl: p => `scene://${name}/${p}` });
    expect(scene.name).toBe(name);
    expect(pois.length).toBe(scene.poi.length);
    for (const p of pois) {
      expect(p.camera.position.length).toBe(3);
      expect(p.marker.position.length).toBe(3);
      expect(p.content.blocks.length).toBeGreaterThan(0);
    }
  });
});
