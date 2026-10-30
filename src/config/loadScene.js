import { buildScene } from './buildScene.js';
import { ConfigError } from './schema.js';

export const SCENE_NAME = /^[a-z0-9][a-z0-9-_]*$/i;

/**
 * Where scene folders live. `VITE_SCENES_BASE` (build-time; absolute, or relative to the page)
 * lets one deployed viewer serve scenes published elsewhere; the default is `./scenes/` next to the app.
 */
export function scenesBase() {
  const base = import.meta.env.VITE_SCENES_BASE || `${import.meta.env.BASE_URL}scenes/`;
  return new URL(base.endsWith('/') ? base : `${base}/`, location.href);
}

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
  return buildScene({
    name,
    read: path => fetchText(new URL(path, base)),
    resolveUrl: path => new URL(path, base).href,
  });
}
