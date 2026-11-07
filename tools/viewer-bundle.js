import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep, extname } from 'node:path';

/**
 * The viewer's file list, for the editor's "Export site" (a zip of the viewer plus one scene).
 *
 * - build: after `vite build`, writes `viewer.json` = { files: [...] } into the output folder: every file of the
 *   viewer (`index.html`, `assets/*`), without the editor page and chunk, the scenes or the manifest itself.
 * - serve: `/__viewer/viewer.json` and `/__viewer/<file>` serve the same thing in `vite dev`, from a production
 *   build made on the first request into node_modules/.cache/roomkit/viewer and redone when src/, index.html
 *   or vite.config.js is newer than it.
 */

export const MANIFEST = 'viewer.json';
const CACHE = ['node_modules', '.cache', 'roomkit', 'viewer'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/** The viewer's files among a build's output paths (forward slashes, relative to the output folder). */
export function viewerFiles(paths) {
  return [...paths]
    .filter(p => p !== 'edit.html' && !/^assets\/edit-[^/]*\.js$/.test(p) && !p.startsWith('scenes/') && !p.startsWith('.vite/') && p !== MANIFEST)
    .sort();
}

async function walk(dir, root = dir, out = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) await walk(p, root, out);
    else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

async function newest(paths) {
  let t = 0;
  for (const p of paths) {
    const s = await stat(p).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) t = Math.max(t, await newest((await readdir(p)).map(n => join(p, n))));
    else t = Math.max(t, s.mtimeMs);
  }
  return t;
}

/** Write `viewer.json` into `outDir`; returns the list. */
export async function writeManifest(outDir) {
  const files = viewerFiles(await walk(outDir));
  await writeFile(join(outDir, MANIFEST), JSON.stringify({ files }, null, 2) + '\n');
  return files;
}

export function viewerBundle() {
  let config;
  return {
    name: 'viewer-bundle',
    configResolved(c) { config = c; },

    async closeBundle() {
      if (config.command !== 'build') return;
      await writeManifest(resolve(config.root, config.build.outDir));
    },

    configureServer(server) {
      const root = config.root;
      const cache = resolve(root, ...CACHE);
      let building = null;

      // a production build of the viewer, once per change to the sources
      const ensure = () => (building ??= (async () => {
        const have = await stat(join(cache, MANIFEST)).catch(() => null);
        const sources = await newest([join(root, 'src'), join(root, 'index.html'), join(root, 'vite.config.js'), join(root, 'package.json')]);
        if (have && have.mtimeMs > sources) return;
        const { build } = await import('vite');
        server.config.logger.info('viewer-bundle: building the viewer for export…');
        await build({ configFile: config.configFile, root, logLevel: 'warn', build: { outDir: cache, emptyOutDir: true } });
      })().finally(() => { building = null; }));

      server.middlewares.use('/__viewer', async (req, res, next) => {
        const path = decodeURIComponent(req.url.split('?')[0]);
        const file = resolve(cache, `.${path}`);
        if (!path || path === '/' || !file.startsWith(cache + sep)) return next();
        try {
          await ensure();
          const bytes = await readFile(file);
          res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(bytes);
        } catch (e) {
          res.statusCode = e.code === 'ENOENT' ? 404 : 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end(e.code === 'ENOENT' ? `not in the viewer build: ${path}` : `viewer build failed: ${e.message}`);
        }
      });
    },
  };
}
