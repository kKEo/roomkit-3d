import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { viewerFiles, writeManifest, MANIFEST } from '../tools/viewer-bundle.js';

describe('viewerFiles', () => {
  it('keeps the viewer page and assets, drops the editor, the scenes and the manifest', () => {
    const out = ['scenes/index.json', 'scenes/loft/scene.json', 'edit.html', 'assets/edit-a1b2.js', 'assets/main-c3d4.js',
      'assets/core-e5f6.js', 'assets/styles-0a1b.css', 'assets/hls.light-2c3d.js', 'index.html', 'viewer.json', '.vite/manifest.json'];
    expect(viewerFiles(out)).toEqual(['assets/core-e5f6.js', 'assets/hls.light-2c3d.js', 'assets/main-c3d4.js', 'assets/styles-0a1b.css', 'index.html']);
  });

  it('does not mistake a prefab chunk for the editor chunk', () => {
    expect(viewerFiles(['assets/editorial-1.js', 'assets/edit-1.js', 'assets/nested/edit-1.js'])).toEqual(['assets/editorial-1.js', 'assets/nested/edit-1.js']);
  });
});

describe('writeManifest', () => {
  it('lists the viewer files of an output folder into viewer.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'viewer-'));
    try {
      await mkdir(join(dir, 'assets'));
      await mkdir(join(dir, 'scenes', 'x'), { recursive: true });
      await writeFile(join(dir, 'index.html'), '<!doctype html>');
      await writeFile(join(dir, 'edit.html'), '<!doctype html>');
      await writeFile(join(dir, 'assets', 'main-1.js'), '');
      await writeFile(join(dir, 'assets', 'edit-1.js'), '');
      await writeFile(join(dir, 'scenes', 'x', 'scene.json'), '{}');
      const files = await writeManifest(dir);
      expect(files).toEqual(['assets/main-1.js', 'index.html']);
      expect(JSON.parse(await readFile(join(dir, MANIFEST), 'utf8'))).toEqual({ files });
      // a second run does not list the manifest it wrote
      expect(await writeManifest(dir)).toEqual(files);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
