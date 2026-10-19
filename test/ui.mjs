// Demo mode (no camera) + screenshots of every screen on desktop and phone sizes.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
mkdirSync('out/ui', { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }], ['phone-land', { width: 844, height: 390 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: name === 'desktop' ? 1 : 2 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:8765/?local');
  await page.screenshot({ path: `out/ui/${name}-home.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(name, 'horizontal overflow px:', overflow);
  await page.click('#demo');
  await page.waitForTimeout(3500);
  // Steer around for a while.
  for (let i = 0; i < 24; i++) {
    const key = i % 4 < 2 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `out/ui/${name}-play.png` });
  const mid = await page.evaluate(() => window.__plank.state);
  console.log(name, 'phase', mid.phase, 'held', mid.held.toFixed(1), 'score', mid.score);
  await page.keyboard.press(' ');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `out/ui/${name}-paused.png` });
  await page.waitForTimeout(4000);
  const end = await page.evaluate(() => ({ screen: document.body.dataset.screen, text: document.querySelector('#results .result-card').innerText.replace(/\s+/g, ' ') }));
  console.log(name, end.screen, end.text.slice(0, 220));
  await page.screenshot({ path: `out/ui/${name}-results.png`, fullPage: true });
  await page.close();
}
await browser.close();
