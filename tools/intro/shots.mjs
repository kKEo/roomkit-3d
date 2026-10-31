import { chromium } from 'playwright';
const out = process.argv[2], stops = (process.argv[3] || '').split(',').filter(Boolean);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5180/?scene=cinema', { waitUntil: 'load' });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/start.png` });
for (const id of stops) {
  await page.evaluate(id => { location.hash = id; }, id);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/${id}.png` });
}
await browser.close();
