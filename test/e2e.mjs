// End-to-end test: the real app, a fake webcam playing a synthetic plank video,
// and checks that calibration, steering and form detection match the script.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { TIMELINES, segmentAt, duration } from './timelines.mjs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const view = process.argv[2] ?? 'front';
const seconds = Number(process.argv[3] ?? 40);
const timeline = TIMELINES[view];
mkdirSync('out/e2e', { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${process.cwd()}/out/${view}.y4m`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 200)); });
await page.addInitScript(([camera, GAME]) => {
  localStorage.setItem('plank-run:v1', JSON.stringify({ safety: { version: 1, ok: true }, settings: { game: GAME, camera, control: camera === 'side' ? 'y' : 'x', target: 30, sound: false, voice: false, showCamera: true, model: 'lite' } }));
}, [view, process.env.GAME ?? (view === 'side' ? 'tunnel' : 'fireflies')]);
await page.goto('http://localhost:8765/?debug&cpu');
await page.click('#start');

const log = [];
const t0 = Date.now();
const shots = new Set();
while (Date.now() - t0 < seconds * 1000) {
  const s = await page.evaluate(() => {
    const st = window.__plank.state;
    const p = st.pose;
    return { phase: st.phase, held: st.held, score: st.score, vt: st.videoTime, delegate: st.delegate, fps: st.fps, ms: st.inferenceMs,
      calibrated: st.calibrated, present: p?.present, raw: p?.rawIssue, issue: p?.issue, ok: p?.formOk, cx: p?.control?.x, cy: p?.control?.y, f: p?.f };
  });
  s.wall = (Date.now() - t0) / 1000;
  if (s.vt) s.seg = segmentAt(timeline, s.vt).label;
  log.push(s);
  const key = `${s.phase}-${s.seg}`;
  if (s.phase && !shots.has(key)) {
    shots.add(key);
    await page.screenshot({ path: `out/e2e/${view}-${String(shots.size).padStart(2, '0')}-${key}.png` });
  }
  await page.waitForTimeout(100);
}
writeFileSync(`out/e2e/${view}.json`, JSON.stringify(log, null, 1));
console.log('game stats:', JSON.stringify(await page.evaluate(() => { const g = window.__plank.game; return { score: g.score, caught: g.caught, coins: g.coins }; })));
const final = await page.evaluate(() => ({ screen: document.body.dataset.screen, text: document.querySelector('#results')?.innerText }));
await browser.close();

// ---- summary per scripted segment (only after calibration) ----
const rows = log.filter((r) => r.calibrated && r.seg);
const bySeg = {};
let lastSeg = null;
let idx = -1;
for (const r of rows) {
  // Group consecutive samples into segment occurrences; skip the first 0.7 s of each (ramp + latency).
  if (r.seg !== lastSeg) { idx += 1; lastSeg = r.seg; }
  const seg = segmentAt(timeline, r.vt);
  if ((r.vt % duration(timeline)) - seg.start < 0.7) continue;
  const k = `${idx}:${r.seg}`;
  (bySeg[k] ??= []).push(r);
}
console.log(`\n${view}: delegate=${log.at(-1)?.delegate} pose fps≈${log.at(-1)?.fps?.toFixed(1)} inference≈${log.at(-1)?.ms?.toFixed(1)}ms`);
console.log('first calibrated at video t =', rows[0]?.vt?.toFixed(2), 'wall', rows[0]?.wall?.toFixed(1));
for (const [k, rs] of Object.entries(bySeg)) {
  const mean = (key) => (rs.reduce((a, r) => a + (r[key] ?? 0), 0) / rs.length).toFixed(2);
  const okFrac = (rs.filter((r) => r.ok).length / rs.length).toFixed(2);
  const issues = [...new Set(rs.map((r) => r.raw).filter(Boolean))].join(',');
  const phases = [...new Set(rs.map((r) => r.phase))].join(',');
  console.log(`${k.padEnd(14)} n=${String(rs.length).padStart(3)} ctrlX=${mean('cx').padStart(6)} ctrlY=${mean('cy').padStart(6)} ok=${okFrac} issues=[${issues}] phases=[${phases}]`);
}
console.log('final screen:', final.screen, final.screen === 'results' ? final.text.replace(/\s+/g, ' ').slice(0, 200) : '');
