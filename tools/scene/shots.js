import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { loadScene, SCENES } from './load.js';
import { sheetHtml, viewNames, viewPose } from '../../src/lib/still.js';
import { mimeOf } from '../../src/editor/export.js';
import { objectBox } from '../../src/lint/geometry.js';

/**
 * Pictures of a scene, taken by the real viewer in a headless browser (`node tools/scene.js shots <scene>`): the
 * whole-room view and one frame per stop, put together on one labelled sheet. This is the last rung of checking a
 * scene without a person: `check` and `describe` say whether it is right, the sheet shows whether it looks right.
 *
 * It starts its own Vite server on a free port, opens the viewer in still mode (`?still`, src/lib/still.js) with
 * reduced motion, asks `window.__roomkit` for each view and takes the picture when that view has settled.
 * It needs Playwright's Chromium (`npx playwright install chromium`). The pictures are for looking, not for
 * comparing pixel by pixel: the rain on screens and the hatching's scan band differ from frame to frame.
 */

const REPO = join(import.meta.dirname, '..', '..');
const DEFAULT_SCENES = join(REPO, 'public', 'scenes');
/** Software WebGL, so it runs on a machine with no GPU as well. */
const CHROMIUM = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** Console errors that say nothing about the scene: fonts and icons a machine without a network cannot fetch. */
const NOISE = [/fonts\.(googleapis|gstatic)\.com/, /favicon/, /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/];

/** Serves `/scenes/…` from a folder other than public/scenes (a sandbox, `ROOMKIT_SCENES`). */
const scenesFrom = root => ({
  name: 'roomkit-scenes-root',
  configureServer(server) {
    server.middlewares.use('/scenes', async (req, res, next) => {
      const file = resolve(root, `.${decodeURIComponent(req.url.split('?')[0])}`);
      if (!file.startsWith(root + sep) || !(await stat(file).then(s => s.isFile(), () => false))) return next();
      res.setHeader('Content-Type', mimeOf(file));
      res.end(await readFile(file));
    });
  },
});

/** Where a scene's sheet goes unless told otherwise; the folder is not under version control. */
export const defaultOut = name => join(REPO, 'tools', 'scene', 'out', `${name}.png`);

/**
 * Takes the pictures. `views` are view names (see `viewPose`); without any, the overview and every stop.
 * Resolves to `{ file, frames: [{ view, label }], errors, notes, ms }`: `errors` are what the page logged or
 * threw (a prefab that failed to render, for one), `notes` what `measure` found. Rejects when the scene has
 * config errors, a view is not one, or the browser cannot be started.
 */
export async function takeShots(name, { views = null, size = [640, 360], out = defaultOut(name), measure = false } = {}) {
  const t0 = Date.now();
  const loaded = await loadScene(name);
  if (!loaded.scene || loaded.errors.length) throw new Error(`${name} has config errors; run: node tools/scene.js check ${name}`);
  const wanted = views?.length ? views : viewNames(loaded.pois).filter(v => v !== 'top');
  for (const v of wanted) { const p = viewPose(v, loaded.scene, loaded.pois); if (p.error) throw new Error(p.error); }
  const label = v => { const i = loaded.pois.findIndex(p => p.id === v); return i < 0 ? v : `${i + 1} ${v}: ${loaded.pois[i].label}`; };

  let chromium, createServer;
  try { ({ chromium } = await import('playwright')); ({ createServer } = await import('vite')); } catch (e) { throw new Error(`pictures need Playwright and Vite from the dev dependencies (npm install): ${e.message}`); }
  const server = await createServer({ root: REPO, logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false }, plugins: SCENES === DEFAULT_SCENES ? [] : [scenesFrom(SCENES)] });
  let browser;
  try {
    await server.listen();
    const base = server.resolvedUrls.local[0];
    try { browser = await chromium.launch({ args: CHROMIUM }); } catch (e) { throw new Error(`could not start Chromium (npx playwright install chromium): ${e.message.split('\n')[0]}`); }
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !NOISE.some(re => re.test(m.text()) || re.test(m.location()?.url ?? ''))) errors.push(m.text().split('\n')[0]); });
    page.on('pageerror', e => errors.push(e.message.split('\n')[0]));

    await page.goto(`${base}?scene=${encodeURIComponent(name)}&still&view=${encodeURIComponent(wanted[0])}`, { waitUntil: 'load' });
    // the first load after a dependency change makes Vite rebuild its cache and reload the page: wait through it
    await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.scene), null, { timeout: 90000 });
    if (await page.evaluate(() => document.documentElement.dataset.scene) === 'error') {
      throw new Error(`the viewer could not show ${name}: ${(await page.evaluate(() => window.__roomkit?.error ?? [])).join('; ') || errors.join('; ')}`);
    }
    const frames = [];
    for (const view of wanted) {
      const r = await page.evaluate(v => window.__roomkit.view(v), view);
      if (!r.ok) throw new Error(`view "${view}": ${r.error ?? 'the camera did not get there'}`);
      frames.push({ view, label: label(view), png: (await page.screenshot({ type: 'png' })).toString('base64') });
    }
    const notes = measure ? compare(loaded, await page.evaluate(() => window.__roomkit.measure())) : [];

    const sheet = await context.newPage();
    await sheet.setContent(sheetHtml(`${name}: ${loaded.scene.title}`, frames, size), { waitUntil: 'load' });
    await sheet.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    const width = await sheet.evaluate(() => document.body.offsetWidth), height = await sheet.evaluate(() => document.body.offsetHeight);
    await sheet.setViewportSize({ width, height });
    await mkdir(dirname(out), { recursive: true });
    await sheet.screenshot({ path: out, type: 'png' });
    return { file: out, frames: frames.map(({ view, label: l }) => ({ view, label: l })), errors: [...new Set(errors)], notes, ms: Date.now() - t0, width, height };
  } finally {
    await browser?.close();
    await server.close();
  }
}

/**
 * Holds each object's declared box (its prefab's `geometry`) against the solid parts the viewer really drew:
 * a line per object whose parts reach more than 0.1 m outside it. `measured` is `window.__roomkit.measure()`.
 */
function compare(loaded, measured) {
  const { scene, pois } = loaded, out = [], n = v => String(Math.round(v * 100) / 100);
  const find = key => { const i = key.lastIndexOf(':'), owner = key.slice(0, i), at = +key.slice(i + 1); return owner === 'decor' ? scene.decor[at] : pois.find(p => p.file === owner)?.objects[at]; };
  let seen = 0;
  for (const { key, box } of measured) {
    const obj = find(key);
    if (!obj || !box) continue;
    let g = null;
    try { g = scene.registry.get(obj.type)?.geometry?.(obj.props) ?? null; } catch { /* `check` reports it */ }
    if (!g || !objectBox(obj, scene.registry)) continue;
    seen++;
    const over = [];
    for (let i = 0; i < 3; i++) {
      if (g.min[i] - box.min[i] > 0.1) over.push(`${'xyz'[i]} ${n(box.min[i])} (box from ${n(g.min[i])})`);
      if (box.max[i] - g.max[i] > 0.1) over.push(`${'xyz'[i]} ${n(box.max[i])} (box to ${n(g.max[i])})`);
    }
    if (over.length) out.push(`${obj.name ?? obj.type} (${key}): drawn parts reach ${over.join(', ')}, outside the box its type declares`);
  }
  return [`measured ${seen} objects against the box their type declares${out.length ? '' : ': all inside, within 0.1 m'}`, ...out];
}
