// ?protocol end to end: the real page, a fake webcam playing the synthetic plank
// video, the whole script in fast mode (?protocol&fast: durations ×0.25, beat
// still 40 BPM). Checks the exported file: schema, derived numbers only (no
// landmarks, no images), ≤ 30 Hz, health block without the pseudonym, summary
// consistent with a recomputation; then runs tools/field-report on it.
//
//   node protocol.mjs [front|side|both]      (server: npx http-server -p 8765 -c-1 -s . in the repo root)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { estimateLatency } from '../js/protocol/latency.js';
import { computeSummary } from '../js/protocol/summary.js';
import { VOICE_LINES } from '../js/voice-lines.js';
import { buildScenario, HOLD_MAX, beatHold, BEAT } from '../js/protocol/scenario.js';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const which = process.argv[2] ?? 'both';
const OUT = 'out/protocol';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures += 1;
  console.log(cond ? 'PASS' : 'FAIL', msg);
};

// ---------- unit checks (Node) ----------
{
  const clicks = Array.from({ length: 12 }, (_, i) => 5000 + i * 1500);
  const sim = (delay, move = 400) => {
    const t = [];
    const x = [];
    for (let at = 3000; at < 25000; at += 33.3) {
      let k = -1;
      for (let i = 0; i < 12; i++) if (at >= clicks[i] + delay) k = i;
      let v = 0;
      if (k >= 0) {
        const side = k % 2 === 0 ? -1 : 1;
        const prev = k === 0 ? 0 : -side;
        const p = Math.min(1, (at - clicks[k] - delay) / move);
        v = prev + (side - prev) * (0.5 - 0.5 * Math.cos(Math.PI * p));
      }
      t.push(Math.round(at));
      x.push(+(v + Math.sin(at * 0.37) * 0.05).toFixed(3));
    }
    return { t, x };
  };
  const r = estimateLatency({ clicks, ...sim(150) });
  ok(Math.abs(r.lagMs - 350) <= 20 && r.confidence === 'ok', `latency estimator: 150 ms delay + 400 ms move → ${r.lagMs} ms (expect ≈350, mid-move), corr ${r.corr}`);
  const flat = estimateLatency({ clicks, t: sim(0).t, x: sim(0).t.map(() => 0.02) });
  ok(!flat || flat.confidence !== 'ok', 'latency estimator: no sway → not confident');
  const ids = ['p_welcome', 'p_go', 'p_rest', 'p_next', 'p_hold_still', 'p_shift', 'p_nod', 'p_sway_beat', 'p_knees', 'p_straight_arms', 'p_side_knee', 'p_shoulder_taps', 'p_stand', 'p_side_flat', 'p_side_sag', 'p_side_pike', 'p_side_rock', 'p_stop_pain', 'p_done', 'p_three_two_one', 'breathe'];
  ok(ids.every((id) => VOICE_LINES[id]), `voice-lines.js has all ${ids.length} line ids`);
  const all = [...buildScenario('front'), ...buildScenario('side')];
  ok(all.every((s) => s.hold <= HOLD_MAX), `every hold ≤ ${HOLD_MAX} s (beat hold ${beatHold(BEAT)} s)`);
  ok(!buildScenario('side', { backPain: true }).some((s) => s.back), 'back pain drops sag and pike');
}

// Every key/value in the file: nothing that looks like landmarks or pictures.
function scanForbidden(obj, path = '$', hits = []) {
  if (Array.isArray(obj)) {
    if (obj.length && obj.every((v) => v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number')) hits.push(`${path}: array of points`);
    obj.forEach((v, i) => { if (v && typeof v === 'object') scanForbidden(v, `${path}[${i}]`, hits); else if (typeof v === 'string' && /^data:|base64/.test(v)) hits.push(`${path}[${i}]: data URL`); });
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/landmark|keypoint|world|image|^frame$|pixels|box|video|photo/i.test(k)) hits.push(`${path}.${k}`);
      if (typeof v === 'string' && (/^data:/.test(v) || v.length > 2000)) hits.push(`${path}.${k}: long/data string`);
      if (v && typeof v === 'object') scanForbidden(v, `${path}.${k}`, hits);
    }
  }
  return hits;
}

async function run(view) {
  const front = view === 'front';
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${process.cwd()}/out/${view}.y4m`,
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const viewport = front ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: front ? 2 : 1, permissions: ['camera'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Playwright's Chromium has no AAC decoder: .m4a voice clips fall back to speech there.
  // MediaPipe's WASM prints its INFO lines through console.error.
  page.on('console', (m) => { if (m.type() === 'error' && !/decode audio data|^INFO:/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const shot = (name) => page.screenshot({ path: `${OUT}/${view}-${name}.png` });
  const state = () => page.evaluate(() => window.__protocol?.state ?? null);

  await page.goto('http://localhost:8765/?protocol&fast&cpu');
  ok(await page.evaluate(() => document.body.dataset.screen) === 'protocol', `${view}: ?protocol opens the protocol, not home`);
  ok(await page.isVisible('#p-consent'), `${view}: consent screen first`);
  const consentText = await page.locator('#p-consent').innerText();
  ok(/90 дней/.test(consentText) && /только владелец/i.test(consentText) && /видео, фото, точки тела/.test(consentText), `${view}: consent says what / who / when`);
  ok(consentText.includes('Держи только до сигнала. Любой отрезок можно сделать на коленях или пропустить. Боль, головокружение, одышка — сразу остановись. Болит поясница — пропусти провис и „домик“'), `${view}: safety paragraph verbatim`);
  ok(await page.isDisabled('#p-consent-next'), `${view}: Next disabled without pseudonym + consent`);
  await page.fill('#p-pseudonym', 'Тест-бот');
  await page.click('label:has(#p-agree)');
  await shot('1-consent');
  await page.click('#p-consent-next');

  // The v0.1.1 safety gate (fresh browser: nothing stored yet).
  ok(await page.evaluate(() => document.body.dataset.screen) === 'safety', `${view}: safety questions come next`);
  for (const q of ['q1', 'q2', 'q3', 'q4']) await page.click(`label:has(input[name="${q}"][value="no"])`);
  await page.click('label:has(#safety-accept)');
  await page.click('#safety-continue');
  ok(await page.isVisible('#p-setup'), `${view}: passing the gate leads to setup`);

  if (!front) {
    await page.click('label:has(input[name="p-camera"][value="side"])');
    ok(await page.isDisabled('#p-setup-next'), `${view}: back-pain question required for the side view`);
    // "No" here so the sag / pike cues run; "yes" is checked by backPainWiring().
    await page.click('label:has(input[name="p-back"][value="no"])');
  }
  await shot('2-setup');
  await page.click('#p-setup-next');
  await page.waitForFunction(() => !document.querySelector('#p-check-start').disabled || !document.querySelector('#p-check-error').hidden, null, { timeout: 90000 });
  const checks = await page.$$eval('#p-checks li', (lis) => lis.map((li) => `${li.dataset.state}:${li.innerText.replace(/\s+/g, ' ')}`));
  console.log('   device check:', checks.join(' | '));
  ok(!(await page.isDisabled('#p-check-start')), `${view}: device check passed`);
  ok(checks.some((c) => /^ok:Модель.*CPU/.test(c)) && checks.some((c) => /^(ok|warn):Скорость.*к\/с.*p50\/p95/.test(c)), `${view}: model, delegate and inference p50/p95 reported`);
  await shot('3-check');
  await page.click('#p-check-start');

  // ---- the script ----
  const t0 = Date.now();
  const seen = new Set();
  let kneeled = false;
  let skipped = false;
  let restSkipped = false;
  let landscape = false;
  const shots = {};
  while (Date.now() - t0 < 8 * 60 * 1000) {
    const s = await state();
    if (s.step !== 'run') break;
    const key = `${s.segIndex}-${s.seg}-${s.phase}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (['calibrate', 'hold', 'rest'].includes(s.phase) && s.segIndex <= 3) await shot(`4-run-${String(s.segIndex).padStart(2, '0')}-${s.seg}-${s.phase}`);
    }
    // Exercise the buttons: knees during a hold, skip an optional segment, skip one rest.
    if (front && s.seg === 'straight_arms' && s.phase === 'hold' && !kneeled) {
      await page.click('#pr-knees');
      kneeled = true;
    }
    if (!front && s.seg === 'side_flat' && s.phase === 'hold' && !kneeled) {
      await page.click('#pr-knees');
      kneeled = true;
    }
    if (front && s.seg === 'side_knee' && ['intro', 'calibrate'].includes(s.phase) && !skipped) {
      await page.click('#pr-skip');
      skipped = true;
    }
    if (s.phase === 'rest' && s.segIndex === 0 && !restSkipped) {
      await page.click('#pr-skip');
      restSkipped = true;
    }
    if (front && s.seg === 'knees' && s.phase === 'calibrate' && !shots.calibLandscape) {
      shots.calibLandscape = true;
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await shot('5-calibrate-landscape');
      await page.setViewportSize(viewport);
    }
    if (front && s.seg === 'shift' && s.phase === 'hold' && !landscape) {
      landscape = true;
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await shot('5-run-landscape');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(150);
      await shot('5-run-laptop');
      await page.setViewportSize(viewport);
    }
    await page.waitForTimeout(80);
  }
  const runSec = (Date.now() - t0) / 1000;
  const s = await state();
  ok(s.step === 'feedback', `${view}: script finished in ${runSec.toFixed(0)} s (step=${s.step})`);
  if (s.step !== 'feedback') {
    await shot('x-stuck');
    await browser.close();
    return null;
  }

  // ---- feedback: label the first pause as false, answer the 5 questions ----
  const nPauses = await page.locator('#p-pauses input[type=checkbox]').count();
  if (nPauses) await page.locator('#p-pauses label.toggle').first().click();
  ok(await page.isDisabled('#p-feedback-next'), `${view}: Done disabled until the 5 questions are answered (${nPauses} pauses listed)`);
  for (const [q, v] of [['neck', '4'], ['amplitude', '3'], ['falsePauses', 'sometimes'], ['fun', '5'], ['loadSpeed', 'fast']]) {
    await page.click(`label:has(input[name="pq-${q}"][value="${v}"])`);
  }
  await page.screenshot({ path: `${OUT}/${view}-6-feedback.png`, fullPage: true });
  await page.click('#p-feedback-next');
  await page.waitForSelector('#p-done:not([hidden])');
  await page.screenshot({ path: `${OUT}/${view}-7-done.png`, fullPage: true });
  const shareShown = await page.isVisible('#p-share');
  console.log(`   share button: ${shareShown ? 'shown (canShare)' : 'hidden (no canShare → download)'}`);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#p-download')]);
  const name = download.suggestedFilename();
  const path = `${OUT}/${name}`;
  await download.saveAs(path);
  await browser.close();

  // ---- the file ----
  ok(/^plank-protocol-test-bot-\d{8}-\d{4}\.json\.gz$/.test(name), `${view}: file name ${name}`);
  const bytes = readFileSync(path);
  ok(bytes[0] === 0x1f && bytes[1] === 0x8b, `${view}: gzip (${(bytes.length / 1024).toFixed(1)} KB)`);
  const text = gunzipSync(bytes).toString('utf8');
  const file = JSON.parse(text);
  writeFileSync(`${OUT}/${view}.json`, JSON.stringify(file, null, 1));
  ok(file.schema === 'plank-run.protocol' && file.v === 1, `${view}: schema plank-run.protocol v1`);
  for (const k of ['meta', 'device', 'analyzer', 'codes', 'scenario', 'segments', 'pauses', 'events', 'samples', 'latency', 'feedback', 'health', 'summary']) {
    if (!(k in file)) ok(false, `${view}: missing block ${k}`);
  }
  ok(file.meta.pseudonym === 'Тест-бот' && file.meta.camera === view && file.meta.ended === 'complete', `${view}: meta ${JSON.stringify({ p: file.meta.pseudonym, cam: file.meta.camera, ended: file.meta.ended, scale: file.meta.scale })}`);
  ok(JSON.stringify(Object.keys(file.health).sort()) === '["backPain","neck"]' && !JSON.stringify(file.health).includes('Тест'), `${view}: health block ${JSON.stringify(file.health)} has no pseudonym`);
  ok(file.feedback.fun === 5 && file.feedback.loadSpeed === 'fast' && file.feedback.falsePauses === 'sometimes' && file.health.neck === 4, `${view}: answers stored`);
  const hits = scanForbidden(file);
  ok(hits.length === 0, `${view}: no landmarks / images / long strings${hits.length ? ` → ${hits.slice(0, 5).join(', ')}` : ''}`);
  ok(!/"(landmarks|keypoints|worldLandmarks)"|data:image/.test(text), `${view}: raw text has no landmark or image keys`);

  const S = file.samples;
  const lens = S.cols.map((c) => S[c].length);
  ok(lens.every((l) => l === S.n) && S.n > 200, `${view}: ${S.n} samples × ${S.cols.length} columns [${S.cols.join(',')}]`);
  ok(S[S.cols[0]].every((v, i, a) => i === 0 || v >= a[i - 1]), `${view}: sample times ascending`);
  let maxPerSec = 0;
  for (let i = 0, j = 0; i < S.n; i++) {
    while (S.t[i] - S.t[j] >= 1000) j += 1;
    maxPerSec = Math.max(maxPerSec, i - j + 1);
  }
  ok(maxPerSec <= 31, `${view}: ≤ 30 Hz (max ${maxPerSec} samples in any 1 s)`);
  ok(S.cols.every((c) => S[c].every((v) => v === null || typeof v === 'number')), `${view}: samples are plain numbers`);

  const types = new Set(file.events.map((e) => e.type));
  const need = ['check_start', 'check_end', 'run_start', 'segment_start', 'calib_start', 'calib_end', 'countdown', 'hold_start', 'hold_end', 'segment_end', 'run_end', 'kneel'];
  ok(need.every((t) => types.has(t)), `${view}: events ${need.filter((t) => !types.has(t)).join(',') || 'all present'} (${[...types].join(',')})`);
  ok(file.events.every((e, i, a) => i === 0 || e.t >= a[i - 1].t), `${view}: events sorted by time`);
  ok(file.segments.length === file.scenario.length, `${view}: ${file.segments.length} segments: ${file.segments.map((g) => `${g.id}=${g.status}${g.variant === 'knees' ? '(колени)' : ''}`).join(' ')}`);
  // fast mode scales every hold except the beat (40 BPM is the measurement).
  ok(file.segments.every((g) => g.heldMs <= HOLD_MAX * 1000 * (file.scenario[g.i].beat ? 1 : file.meta.scale) + 500), `${view}: no hold longer than ${HOLD_MAX} s (scaled): ${file.segments.map((g) => g.heldMs).join(',')}`);
  ok(file.segments.filter((g) => g.calib.some((c) => c.ok)).length >= file.segments.length - 2, `${view}: calibrated in most segments (${file.segments.map((g) => g.calib.map((c) => (c.ok ? `${c.ms}` : c.aborted ? 'abort' : 'x')).join('/')).join(' ')})`);
  ok(file.pauses.every((p) => typeof p.falsePause === 'boolean' && typeof p.reason === 'string'), `${view}: ${file.pauses.length} pauses with reason + label (${file.pauses.map((p) => `${file.scenario[p.seg].id}:${p.reason}${p.expected ? '*' : ''}${p.falsePause ? '!' : ''}`).join(' ')})`);
  if (nPauses) ok(file.pauses[0].falsePause === true, `${view}: "Эта пауза была зря" label saved`);

  if (front) {
    ok(file.events.filter((e) => e.type === 'click').length === 12, `${view}: 12 beat clicks logged`);
    ok(file.latency && typeof file.latency.lagMs === 'number', `${view}: latency estimated ${JSON.stringify(file.latency && { lag: file.latency.lagMs, method: file.latency.method, corr: file.latency.corr, conf: file.latency.confidence, reasons: file.latency.reasons, capture: file.latency.captureLagMs, raw: file.latency.rawLagMs })}`);
    ok(file.segments.find((g) => g.id === 'side_knee').status === 'skipped', `${view}: optional segment skipped by button`);
    ok(file.segments.find((g) => g.id === 'straight_arms').variant === 'knees', `${view}: "На коленях" switched the variant`);
  } else {
    ok(file.scenario.some((g) => g.id === 'side_sag') && file.scenario.some((g) => g.id === 'side_pike'), `${view}: no back pain → sag and pike included`);
    const cues = file.events.filter((e) => e.type === 'cue' && e.expect);
    ok(cues.some((e) => e.line === 'p_side_sag') && cues.some((e) => e.line === 'p_side_pike'), `${view}: sag / pike cues fired with expected-pause windows`);
    ok(S.cols.includes('ang') && S.cols.includes('dev') && !S.cols.includes('dx'), `${view}: side features recorded`);
  }

  // The stored summary must match a fresh recomputation (what tools/field-report does).
  const { summary, ...rest } = file;
  const again = computeSummary(rest);
  ok(JSON.stringify(again) === JSON.stringify(summary), `${view}: summary reproducible from raw data`);
  console.log(`   summary: calib first ${summary.calibration.firstMs} ms (${summary.calibration.firstAttempts} tries), false/min ${summary.pauses.falsePerMin}, all/min ${summary.pauses.allPerMin}, steer ${summary.steering.maxNeg}/${summary.steering.maxPos}, latency ${summary.latency.ms} (${summary.latency.confidence}), fps ${summary.perf.fps}, inf ${summary.perf.inferenceP50}/${summary.perf.inferenceP95}`);
  ok(errors.length === 0, `${view}: no page errors${errors.length ? ` → ${errors.slice(0, 3).join(' | ')}` : ''}`);
  return path;
}

// Back pain → sag and pike are not in the script (checked through the real page, up to the device check).
async function backPainWiring() {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.cwd()}/out/side.y4m`] });
  const ctx = await browser.newContext({ permissions: ['camera'] });
  await ctx.addInitScript(() => localStorage.setItem('plank-run:v1', JSON.stringify({ safety: { version: 1, ok: true } })));
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/?protocol&fast&cpu');
  await page.fill('#p-pseudonym', 'x');
  await page.click('label:has(#p-agree)');
  await page.click('#p-consent-next');
  ok(await page.isVisible('#p-setup'), 'stored safety pass → straight to setup');
  await page.click('label:has(input[name="p-camera"][value="side"])');
  await page.click('label:has(input[name="p-back"][value="yes"])');
  await page.click('#p-setup-next');
  await page.waitForFunction(() => !document.querySelector('#p-check-start').disabled, null, { timeout: 90000 });
  const ids = await page.evaluate(() => window.__protocol.state.scenario);
  ok(!ids.includes('side_sag') && !ids.includes('side_pike') && ids.includes('side_flat'), `back pain → script without sag / pike: ${ids.join(', ')}`);
  await browser.close();
}

const files = [];
if (which !== 'front') await backPainWiring();
for (const view of which === 'both' ? ['front', 'side'] : [which]) {
  const f = await run(view);
  if (f) files.push(f);
}

if (files.length) {
  console.log('\n--- tools/field-report/report.mjs ---');
  try {
    const out = execFileSync('node', ['../tools/field-report/report.mjs', ...files, '--include-fast', '--detail'], { encoding: 'utf8' });
    console.log(out);
    ok(/Готово, когда/.test(out), 'field report prints the "Готово, когда" table');
  } catch (err) {
    ok(false, `field report failed: ${err.message}`);
  }
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
