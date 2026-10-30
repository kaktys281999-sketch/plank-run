// v0.1.1 checks: health questions gate the first real set, targets are capped,
// and a set ends by itself at the target, or 45 s by the clock with flickering form (D2).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
mkdirSync('out/ui', { recursive: true });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ok = (cond, msg) => console.log(cond ? 'PASS' : 'FAIL', msg);

// 1. Fresh visitor: Start opens the questions; a "yes" leads to the doctor screen.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/');
  const targets = await page.$$eval('input[name="target"]', (els) => els.map((e) => e.value));
  ok(targets.join(',') === '20,30,45', `targets offered: ${targets}`);
  ok(await page.$eval('input[name="target"]:checked', (e) => e.value) === '30', 'default target 30 s');
  await page.click('#start');
  ok(await page.evaluate(() => document.body.dataset.screen) === 'safety', 'Start opens the safety questions');
  ok(await page.isDisabled('#safety-continue'), 'Continue disabled until answered');
  await page.screenshot({ path: 'out/ui/safety-form.png', fullPage: true });
  await page.click('label:has(input[name="q1"][value="no"])');
  await page.click('label:has(input[name="q2"][value="no"])');
  await page.click('label:has(input[name="q3"][value="no"])');
  await page.click('label:has(input[name="q4"][value="yes"])');
  await page.click('label:has(#safety-accept)');
  await page.click('#safety-continue');
  ok(await page.isVisible('#safety-stop'), 'a "yes" shows the doctor screen');
  await page.screenshot({ path: 'out/ui/safety-stop.png', fullPage: true });
  await page.click('#safety-back').catch(() => {});
  await page.goto('http://localhost:8765/');
  await page.click('#start');
  ok(await page.evaluate(() => document.body.dataset.screen) === 'safety', 'blocked user is asked again, not let into play');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('plank-run:v1')).safety);
  ok(stored && stored.ok === false && !('q1' in stored), `only the outcome is stored: ${JSON.stringify(stored)}`);
  await ctx.close();
}

// 2. All "no" → the real session starts (camera screen).
{
  const ctx = await browser.newContext({ permissions: ['camera'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/?cpu');
  await page.click('#start');
  for (const q of ['q1', 'q2', 'q3', 'q4']) await page.click(`label:has(input[name="${q}"][value="no"])`);
  await page.click('label:has(#safety-accept)');
  await page.click('#safety-continue');
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.body.dataset.screen) === 'play', 'all "no" starts the session');
  await ctx.close();
}

// 3. Old saved target (2 min) is clamped; a demo set ends by itself at the target.
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem('plank-run:v1', JSON.stringify({ settings: { target: 120, game: 'tunnel', sound: false, voice: false } })));
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/');
  ok(await page.$eval('input[name="target"]:checked', (e) => e.value) === '30', 'stored 120 s clamped to 30 s');
  await page.click('label:has(input[name="target"][value="20"])');
  await page.click('#demo');
  await page.waitForTimeout(25000);
  const screen = await page.evaluate(() => document.body.dataset.screen);
  const reason = await page.locator('#res-reason').innerText();
  const tip = await page.locator('#res-tip').innerText();
  ok(screen === 'results', `set ended by itself (screen=${screen})`);
  ok(/Демо|Цель выполнена/.test(reason), `reason: ${reason}`);
  ok(!/добавь 5–10/.test(tip), `tip: ${tip}`);
  await ctx.close();
}

// 4. Flickering form: each short break pauses `held`, yet the set ends by itself
//    45 s by the clock after the countdown (D2), with no "fell short" words.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('plank-run:v1', JSON.stringify({ settings: { target: 45, game: 'fireflies', sound: false, voice: false } })));
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/');
  await page.click('#demo');
  // Page clock from the end of the countdown (first play or pause) to the results screen.
  const clock = page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    let start = null;
    const id = setInterval(() => {
      const st = window.__plank.state;
      const now = performance.now();
      if (start === null && (st.phase === 'play' || st.phase === 'paused')) start = now;
      if (st.screen === 'results' || now - t0 > 90000) {
        clearInterval(id);
        resolve({ screen: st.screen, secs: start === null ? null : (now - start) / 1000, held: st.held });
      }
    }, 20);
  }));
  await page.waitForFunction(() => window.__plank.state.phase === 'play');
  // Form breaks for 1.5 s every 3 s: each pause is shorter than the 4 s auto-stop.
  const t0 = Date.now();
  while (Date.now() - t0 < 80000 && await page.evaluate(() => document.body.dataset.screen) === 'play') {
    await page.keyboard.press(' ');
    await page.waitForTimeout(1500);
  }
  const { screen, secs, held } = await clock;
  await page.screenshot({ path: 'out/ui/safety-limit.png', fullPage: true });
  const sub = await page.locator('#res-sub').innerText();
  ok(screen === 'results', `flickering set ended by itself (screen=${screen})`);
  ok(secs !== null && secs <= 45.5, `it lasted ${secs?.toFixed(1)} s by the clock after the countdown, limit 45 s`);
  ok(secs >= 44.5 && held < 45, `the clock ended it, not the form auto-stop or the target (held ${held.toFixed(1)} s)`);
  ok(/не дольше 45 с/.test(sub) && !/не хватило/.test(sub), `sub: ${sub}`);
  await ctx.close();
}
await browser.close();
