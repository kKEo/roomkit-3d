import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectScene } from '../../src/config/buildScene.js';
import { inspectFindings } from '../../src/lint/rules.js';
import { lintPrefab } from '../../src/lint/prefabRules.js';

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
  const exists = path => stat(join(loaded.dir, path)).then(s => s.isFile(), () => false);
  const result = await inspectFindings(loaded, { files: loaded.files, exists, listed: listed ? listed.includes(name) : undefined });
  result.findings.push(...await checkPrefabs(loaded, { exists }), ...unplaced(loaded, name));
  return { ...loaded, ...result };
}

/** A type the scene declares but places nowhere: nothing shows it, and nothing would notice it break. */
function unplaced(loaded, name) {
  if (!loaded.scene) return [];
  const used = new Set([...loaded.scene.decor, ...loaded.pois.flatMap(p => p.objects)].map(o => o.type));
  return ownPrefabs(loaded).filter(o => !used.has(o.type)).map(o => ({
    level: 'warn', code: 'PREFAB_UNUSED', file: `${name}/scene.json`, path: `prefabs.${o.type}`, message: `"${o.type}" is declared but no object uses it`,
    hint: `place one, or run \`node tools/scene.js showroom ${name}\` for a room that shows every type, or take it out of "prefabs"`,
  }));
}

/** The scene's own object types whose module is a file in its folder: `[{ type, path, entry }]`. */
export function ownPrefabs(loaded) {
  let decl = {};
  try { decl = JSON.parse(loaded.files.get('scene.json') ?? '{}').prefabs ?? {}; } catch { /* reported as a config error */ }
  const extra = loaded.registry?.extra ?? {};
  return Object.entries(decl).filter(([type, path]) => typeof path === 'string' && !/^([a-z]+:|\/)/i.test(path) && extra[type]).map(([type, path]) => ({ type, path, entry: extra[type] }));
}

/** Every finding for those types (src/lint/prefabRules.js): each is rendered without a browser and measured. `only` names one type. */
export async function checkPrefabs(loaded, { exists, only = null } = {}) {
  const out = [], sceneUrl = pathToFileURL(loaded.dir + sep).href;
  for (const { type, path, entry } of ownPrefabs(loaded)) {
    if (only && type !== only) continue;
    const source = await readFile(join(loaded.dir, path), 'utf8').catch(() => null);
    out.push(...await lintPrefab({ type, entry, file: `${loaded.dir.split(sep).pop()}/${path}`, source, sceneUrl, exists }));
  }
  return out;
}
