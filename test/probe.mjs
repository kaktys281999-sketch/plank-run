import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const dir = process.argv[2] ?? 'out/stills';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:8765/test/probe.html?model=${process.env.POSE_MODEL ?? 'lite'}`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
for (const f of readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
  const r = await page.evaluate((src) => window.probe(src), `/test/${dir}/${f}`);
  if (!r) { console.log(f, 'NO POSE'); continue; }
  const view = f.startsWith('side') ? 'side' : 'front';
  console.log(f.padEnd(20), JSON.stringify(r[view]), '\n   vis', r.vis);
}
await browser.close();
