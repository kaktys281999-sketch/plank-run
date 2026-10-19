import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const dir = process.argv[2] ?? 'out/stills';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8765/test/probe-face.html');
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
for (const f of readdirSync(dir).filter((f) => f.startsWith('front')).sort()) {
  console.log(f.padEnd(20), JSON.stringify(await page.evaluate((src) => window.probe(src), `/test/${dir}/${f}`)));
}
await browser.close();
