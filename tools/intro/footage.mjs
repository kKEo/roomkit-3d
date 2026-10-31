/**
 * Records a scripted tour of the cinema scene with Playwright (headed Chromium, so the GPU draws it)
 * into tools/intro/out/footage.webm, and writes when each stop starts to out/marks.json, which
 * intro.html reads to place its captions.
 * Usage: node tools/intro/footage.mjs [http://localhost:5180/]
 */
import { chromium } from 'playwright';
import { mkdir, rename, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://localhost:5180/';
const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const t0 = Date.now();
const marks = {};
const mark = label => { marks[label] = (Date.now() - t0) / 1000; console.log(`${marks[label].toFixed(2)}s  ${label}`); };
const wait = ms => page.waitForTimeout(ms);

await page.goto(`${base}?scene=cinema`, { waitUntil: 'load' });
mark('loaded');
await wait(7500);                       // loader, then the intro flight onto the screen
mark('welcome');
await page.mouse.move(430, 350);
await wait(600);
await page.mouse.click(430, 350);       // zoom into the big screen
mark('zoom');
await wait(3000);
await page.keyboard.press('Escape');
mark('unzoom');
await wait(2200);
const go = async (id, ms) => { await page.evaluate(id => { location.hash = id; }, id); mark(id); await wait(ms); };
await go('features', 4500);
await go('booth', 4800);
await go('machine', 4000);
await go('build', 4000);
await go('exits', 4000);
await page.keyboard.press('Digit0');    // the whole hall
mark('overview');
await wait(4500);
await page.evaluate(() => { location.hash = 'welcome'; }); mark('welcome2'); await wait(4500);
mark('end');
const video = page.video();
await ctx.close();
await browser.close();
await rename(await video.path(), `${out}footage.webm`);
await writeFile(`${out}marks.json`, JSON.stringify(marks, null, 2));
console.log('wrote', `${out}footage.webm`);
