import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectScene } from '../../src/config/buildScene.js';
import { inspectFindings } from '../../src/lint/rules.js';

/** Reading a scene folder from disk for the scene tools (tools/scene.js) and the test suite. */

/** The folder of scene folders: `public/scenes`, or `ROOMKIT_SCENES` for a run that must not touch the shipped ones (tests, a sandbox). */
export const SCENES = process.env.ROOMKIT_SCENES ? resolve(process.env.ROOMKIT_SCENES) : join(import.meta.dirname, '..', '..', 'public', 'scenes');

/** A buildScene `read` over a folder. */
export const readerFromDir = dir => async path => {
  try { return await readFile(join(dir, path), 'utf8'); } catch (e) { throw new Error(e.code === 'ENOENT' ? 'file not found' : e.message); }
};

/** The folder's JSON and Markdown files as a Map (path with "/" → text). */
export async function textFiles(dir) {
  const files = new Map();
  const walk = async d => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(json|md)$/.test(e.name)) files.set(relative(dir, full).split(sep).join('/'), await readFile(full, 'utf8'));
    }
  };
  await walk(dir);
  return files;
}

/** The names of the scene folders, and what scenes/index.json lists (null when it cannot be read). */
export async function sceneNames(root = SCENES) {
  const dirs = (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  let listed = null;
  try { listed = JSON.parse(await readFile(join(root, 'index.json'), 'utf8')).scenes; } catch { /* no index */ }
  return { dirs, listed };
}

/** Builds a scene folder without throwing: `{ scene, pois, errors, files, dir }`. */
export async function loadScene(name, root = SCENES) {
  const dir = join(root, name);
  const built = await inspectScene({
    name,
    read: readerFromDir(dir),
    resolveUrl: p => pathToFileURL(join(dir, p)).href,
    loadModule: url => import(url),
  });
  return { ...built, dir, files: await textFiles(dir) };
}

/**
 * Every finding for a scene folder (see src/lint/rules.js), with what its `brief.json` came to:
 * `expectations` is `{ total, held }` and `brief` the description the scene was built from, or null.
 */
export async function checkScene(name, root = SCENES) {
  const loaded = await loadScene(name, root);
  const { listed } = await sceneNames(root);
  const result = await inspectFindings(loaded, {
    files: loaded.files,
    exists: path => stat(join(loaded.dir, path)).then(s => s.isFile(), () => false),
    listed: listed ? listed.includes(name) : undefined,
  });
  return { ...loaded, ...result };
}
