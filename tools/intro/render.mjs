/**
 * Renders intro.html frame by frame with Playwright and encodes public/scenes/cinema/media/intro.mp4
 * with ffmpeg (H.264, 720p, no audio). Needs the dev server (default http://localhost:5180/) and
 * out/footage.webm from footage.mjs.
 *   node tools/intro/render.mjs                    the whole film
 *   node tools/intro/render.mjs --preview 2,7,20   PNG stills at those seconds, into out/preview/
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'http://localhost:5180/';
const preview = args.includes('--preview') ? args[args.indexOf('--preview') + 1].split(',').map(Number) : null;
const here = new URL('./', import.meta.url).pathname;
const out = `${here}out/`, frames = `${out}frames/`, target = `${here}../../public/scenes/cinema/media/intro.mp4`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('[page]', e.message));
await page.goto(`${base}tools/intro/intro.html`, { waitUntil: 'load' });
await page.evaluate(() => window.ready);
const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: window.DURATION, FPS: window.FPS }));
const grab = async t => Buffer.from((await page.evaluate(t => window.seek(t).then(() => document.getElementById('c').toDataURL('image/png')), t)).split(',')[1], 'base64');

if (preview) {
  await mkdir(`${out}preview/`, { recursive: true });
  for (const t of preview) await writeFile(`${out}preview/t${t}.png`, await grab(t));
  console.log('stills in', `${out}preview/`);
} else {
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const n = Math.round(DURATION * FPS);
  for (let i = 0; i < n; i++) {
    await writeFile(`${frames}f${String(i).padStart(5, '0')}.png`, await grab(i / FPS));
    if (i % 150 === 0) console.log(`${i}/${n}`);
  }
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', `${frames}f%05d.png`,
    '-c:v', 'libx264', '-preset', 'slower', '-crf', '31', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
    '-movflags', '+faststart', '-an', target], { stdio: 'inherit' });
  if (ff.status !== 0) process.exit(ff.status ?? 1);
  console.log('wrote', target, `(${n} frames, ${DURATION.toFixed(1)} s)`);
}
await browser.close();
