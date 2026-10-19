// Renders a few reference stills to eyeball the synthetic plank poses.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'out/stills';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:8765/test/render.html?model=${process.env.MODEL ?? 'Michelle.glb'}`);
await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
console.log((await page.evaluate(() => window.boneNames)).join(' '));
const L = Number(process.env.LOOK ?? 30);
const shots = [
  ['front-neutral', { look: L }, 'front'], ['front-stand', { stand: true }, 'front'], ['front-shiftL', { shift: 6, look: L }, 'front'], ['front-shiftR', { shift: -6, look: L }, 'front'],
  ['front-sag', { sag: 18, look: L }, 'front'], ['front-pike', { pike: 25, look: L }, 'front'], ['front-forearm', { forearm: true, look: L }, 'front'], ['front-nolook', {}, 'front'],
  ['side-neutral', {}, 'side'], ['side-sag', { sag: 18 }, 'side'], ['side-pike', { pike: 25 }, 'side'], ['side-rock', { rock: 0.07 }, 'side'], ['side-forearm', { forearm: true }, 'side'], ['side-stand', { stand: true }, 'side'],
];
for (const [name, p, view] of shots) {
  const url = await page.evaluate(([p, view]) => window.renderFrame({ ...p, resetCamera: true }, view), [p, view]);
  writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
