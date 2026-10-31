import { buildScene } from './buildScene.js';
import { ConfigError } from './schema.js';
import { preloadPrefabs } from '../prefabs/preload.js';
import { scenesBase, guardOrigin } from './origins.js';

export { scenesBase, guardOrigin, guardData } from './origins.js';

export const SCENE_NAME = /^[a-z0-9][a-z0-9-_]*$/i;

export function sceneNameFromUrl() {
  return new URLSearchParams(location.search).get('scene');
}

/** Text of a file by URL; rejects with a reason (`file not found (HTTP 404)`, a network error). */
async function fetchText(url) {
  const res = await fetch(url);
  // The dev server answers unknown paths with index.html, so treat HTML as "missing" too.
  if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) {
    throw new Error(`file not found${res.ok ? '' : ` (HTTP ${res.status})`}`);
  }
  return res.text();
}

/** Imports a scene's own module (a prefab or a transform) by URL; Vite leaves the URL alone (`@vite-ignore`), the browser fetches it. */
export const importModule = url => import(/* @vite-ignore */ guardOrigin(url));

/** Loads the scene named by `?scene=` (or the default from scenes/index.json) over HTTP. */
export async function loadScene() {
  const root = scenesBase();
  let name = sceneNameFromUrl();
  if (!name) {
    let text;
    try { text = await fetchText(new URL('index.json', root)); } catch (e) { throw new ConfigError([`scenes/index.json: ${e.message}`]); }
    try { name = JSON.parse(text).default; } catch (e) { throw new ConfigError([`scenes/index.json: invalid JSON — ${e.message}`]); }
  }
  if (!SCENE_NAME.test(name || '')) throw new ConfigError([`invalid scene name "${name}"`]);

  const base = new URL(`${name}/`, root);
  const built = await buildScene({
    name,
    read: path => fetchText(new URL(path, base)),
    resolveUrl: path => new URL(path, base).href,
    loadModule: importModule,
  });
  // fetch the code of every prefab the scene uses while the loading screen is still up
  return preloadPrefabs(built);
}
