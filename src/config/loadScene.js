import { buildScene } from './buildScene.js';
import { ConfigError } from './schema.js';
import { preloadPrefabs } from '../prefabs/preload.js';
import { scenesBase, guardOrigin, prefabOriginsOf, setRuntimeOrigins } from './origins.js';

export { scenesBase, guardOrigin, guardData, prefabOrigins } from './origins.js';

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

let index;

/**
 * `scenes/index.json`, parsed, fetched once per page: the default scene and the operator's `prefabOrigins`,
 * which it applies (`setRuntimeOrigins`). Rejects with a ConfigError naming the file.
 */
export function loadIndex() {
  return (index ??= (async () => {
    let text;
    try { text = await fetchText(new URL('index.json', scenesBase())); } catch (e) { throw new ConfigError([`scenes/index.json: ${e.message}`]); }
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new ConfigError([`scenes/index.json: invalid JSON — ${e.message}`]); }
    setRuntimeOrigins(prefabOriginsOf(parsed));
    return parsed;
  })().catch(e => { index = undefined; throw e; }));
}

/** Loads the scene named by `?scene=` (or the default from scenes/index.json) over HTTP. */
export async function loadScene() {
  const root = scenesBase();
  let name = sceneNameFromUrl();
  // the index names the default scene and the code origins the operator allows; a `?scene=` works without it
  if (name) await loadIndex().catch(() => null);
  else name = (await loadIndex()).default;
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
