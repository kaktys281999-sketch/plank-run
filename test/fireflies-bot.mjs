// Demo mode bot: moves the pointer toward the nearest firefly to check catching, scoring and screens.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
mkdirSync('out/ui', { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/');
  await page.screenshot({ path: `out/ui/ff-${name}-home.png`, fullPage: true });
  await page.click('#demo');
  await page.waitForTimeout(3300);
  const box = await page.locator('#game').boundingBox();
  for (let i = 0; i < 120; i++) {
    const target = await page.evaluate(() => {
      const g = window.__plank.game;
      const jar = g.toScreen(g.player);
      let best = null;
      for (const f of g.flies) {
        const p = g.toScreen(f);
        const d = Math.hypot(p.x - jar.x, p.y - jar.y);
        if (!best || d < best.d) best = { ...p, d };
      }
      return best;
    });
    if (target) await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 3 });
    await page.waitForTimeout(100);
    if (i === 70) await page.screenshot({ path: `out/ui/ff-${name}-play.png` });
  }
  const st = await page.evaluate(() => { const g = window.__plank.game; return { score: g.score, caught: g.caught, missed: g.missed, gems: g.gems, combo: g.bestCombo, flies: g.flies.length }; });
  console.log(name, JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log(name, 'results:', (await page.locator('#results .result-card').innerText()).replace(/\s+/g, ' ').slice(0, 260));
  await page.screenshot({ path: `out/ui/ff-${name}-results.png`, fullPage: true });
  console.log(name, 'errors:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
