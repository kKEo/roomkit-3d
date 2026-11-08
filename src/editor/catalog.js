import { TYPE_NAME } from '../prefabs/registry.js';

/**
 * A prefab catalog: one JSON file on a host that lists several scene-shipped prefabs, so the editor can offer
 * them as a pick list instead of one module URL at a time. The format (see the operator guide, "Scene-shipped
 * prefabs › Publishing a catalog"):
 *
 *   { "roomkit": 1, "title": "Acme furniture",
 *     "prefabs": [ { "type": "kiosk", "url": "kiosk@1.2.0.js", "title": "Kiosk", "blurb": "…", "glyph": "▮" }, … ] }
 *
 * `url` is resolved against the catalog's own URL, so a folder can be copied or mirrored whole. `title`, `blurb`
 * and `glyph` are hints shown before a module is fetched; the module's own meta wins once it is checked.
 */

export const CATALOG_VERSION = 1;

/** Whether a URL names a catalog rather than a module: by its extension, so no fetch is needed to decide. */
export const isCatalogUrl = url => /\.json(\?.*)?(#.*)?$/i.test(String(url).trim());

/**
 * Parses a catalog's text into `{ title, prefabs: [{ type, url, title?, blurb?, glyph? }] }` with absolute URLs,
 * or throws an Error that says what is wrong with it.
 */
export function parseCatalog(text, catalogUrl) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`not valid JSON: ${e.message}`); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('a catalog is a JSON object with "roomkit" and "prefabs"');
  if (doc.roomkit !== CATALOG_VERSION) throw new Error(`"roomkit" must be ${CATALOG_VERSION} (the catalog format this editor reads)${doc.roomkit === undefined ? '' : `, not ${JSON.stringify(doc.roomkit)}`}`);
  if (!Array.isArray(doc.prefabs) || !doc.prefabs.length) throw new Error('"prefabs" must be a list with at least one entry');
  const seen = new Set();
  const prefabs = doc.prefabs.map((p, i) => {
    const at = `prefabs.${i}`;
    if (!p || typeof p !== 'object') throw new Error(`${at}: must be an object with "type" and "url"`);
    if (typeof p.type !== 'string' || !TYPE_NAME.test(p.type)) throw new Error(`${at}.type: a type name is letters, digits and "_", starting with a lowercase letter`);
    if (seen.has(p.type)) throw new Error(`${at}.type: "${p.type}" is listed twice`);
    seen.add(p.type);
    if (typeof p.url !== 'string' || !p.url.trim()) throw new Error(`${at}.url: give the module's URL (relative to the catalog, or absolute)`);
    let url;
    try { url = new URL(p.url, catalogUrl).href; } catch { throw new Error(`${at}.url: "${p.url}" is not a URL`); }
    const out = { type: p.type, url };
    for (const k of ['title', 'blurb', 'glyph']) {
      if (p[k] == null) continue;
      if (typeof p[k] !== 'string' || !p[k].trim()) throw new Error(`${at}.${k}: must be a non-empty string`);
      if (k === 'glyph' && ![1, 2].includes([...p[k].trim()].length)) throw new Error(`${at}.glyph: one or two characters`);
      out[k] = p[k].trim();
    }
    return out;
  });
  return { title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : null, prefabs };
}
