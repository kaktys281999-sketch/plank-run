#!/usr/bin/env node
// Stage 0 field report (plan §12.1): reads ?protocol files sent by friends and
// prints the "Готово, когда" table — per run, per person and in aggregate.
//
//   node tools/field-report/report.mjs <file.json.gz|file.json|folder> [...]
//        [--detail]        per-segment numbers (pauses, okPct, control spread, fps)
//        [--no-names]      #1, #2 … instead of pseudonyms (for sharing the output)
//        [--include-fast]  count ?protocol&fast test runs in the aggregate
//        [--json]          machine-readable output
//
// Everything is recomputed from the raw samples and events with the same code
// the page uses (js/protocol/summary.js), so a fix there re-scores old files.
// The files hold personal and health data (D16): keep them out of git, delete
// 90 days after the thresholds are tuned.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import { computeSummary } from '../../js/protocol/summary.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const inputs = args.filter((a) => !a.startsWith('--'));
if (!inputs.length) {
  console.error('usage: node tools/field-report/report.mjs <file.json.gz|folder> [...] [--detail] [--no-names] [--include-fast] [--json]');
  process.exit(2);
}

// ---------- load ----------
function listFiles(p) {
  if (statSync(p).isDirectory()) return readdirSync(p).filter((f) => /\.json(\.gz)?$/.test(f)).flatMap((f) => listFiles(join(p, f)));
  return [p];
}

function load(path) {
  const raw = readFileSync(path);
  const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const file = JSON.parse(text);
  if (file.schema !== 'plank-run.protocol') throw new Error('not a plank-run protocol file');
  const { summary: stored, ...data } = file;
  return { path, file: data, stored, summary: computeSummary(data) };
}

const runs = [];
for (const p of inputs.flatMap(listFiles)) {
  try {
    runs.push(load(p));
  } catch (err) {
    console.error(`skip ${p}: ${err.message}`);
  }
}
if (!runs.length) {
  console.error('no protocol files found');
  process.exit(1);
}

// ---------- devices ----------
function deviceOf(d = {}) {
  const ua = d.ua ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && d.mobile);
  const android = /Android/.test(ua);
  const os = ios ? 'iOS' : android ? 'Android' : 'desktop';
  const phone = (ios && !/iPad/.test(ua)) || (android && /Mobile/.test(ua)) || (d.mobile === true && os !== 'desktop');
  let label;
  if (ios) label = `${/iPad/.test(ua) ? 'iPad' : 'iPhone'} iOS ${(ua.match(/OS (\d+(?:_\d+)?)/)?.[1] ?? '?').replace('_', '.')}`;
  else if (android) label = `${d.model || 'Android'} A${ua.match(/Android (\d+)/)?.[1] ?? '?'}`;
  else label = `${d.platform ?? 'desktop'} ${ua.match(/(Chrome|Firefox|Safari|Edg)\/(\d+)/)?.slice(1).join(' ') ?? ''}`.trim();
  // Same phone = same OS, model and screen; good enough to count distinct phones among friends.
  const key = [os, d.model ?? '', d.screen?.w, d.screen?.h, d.screen?.dpr, d.cores, d.memoryGb].join('|');
  return { os, phone, label, key };
}

// ---------- formatting ----------
const names = new Map();
const nameOf = (p) => {
  if (!flag('--no-names')) return p || '?';
  if (!names.has(p)) names.set(p, `#${names.size + 1}`);
  return names.get(p);
};
const sec = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`);
const num = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
const mark = (v) => (v === true ? '✓' : v === false ? '✗' : '—');
const median = (a) => {
  const s = a.filter((v) => v !== null && v !== undefined).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function table(rows, head) {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.max(...all.map((r) => [...r[i]].length)));
  const line = (r) => r.map((c, i) => c + ' '.repeat(w[i] - [...c].length)).join('  ');
  return [line(all[0]), w.map((n) => '─'.repeat(n)).join('  '), ...all.slice(1).map(line)].join('\n');
}

// ---------- per run ----------
const rows = runs.map((r) => {
  const s = r.summary;
  const m = r.file.meta;
  const dev = deviceOf(r.file.device);
  const lat = s.latency;
  return {
    r,
    dev,
    cells: [
      nameOf(m.pseudonym) + (m.scale !== 1 ? ' (fast)' : ''),
      m.camera,
      dev.label,
      `${s.perf.delegate ?? '—'}`,
      sec(s.perf.loadMs),
      `${num(s.perf.inferenceP50)}/${num(s.perf.inferenceP95)}`,
      num(s.perf.fps),
      `${sec(s.calibration.firstMs)} ×${s.calibration.firstAttempts ?? '—'}${s.calibration.failedTwice ? ' ✗' : ''}`,
      `${num(s.pauses.falsePerMin, 2)} (${num(s.pauses.allPerMin, 2)})`,
      `${num(s.steering.maxNeg, 2)}/${num(s.steering.maxPos, 2)} ${mark(s.steering.reachedBoth)}`,
      s.answers.neck ?? '—',
      s.answers.fun ?? '—',
      lat.ms === null ? '—' : `${lat.ms}ms ${lat.method === 'sine' ? '∿' : '⊓'}${lat.confidence === 'ok' ? '' : '?'}`,
      `${s.segments.done}/${s.segments.planned}${m.ended === 'complete' ? '' : ' стоп'}`,
    ],
  };
});

// One row per person for the criteria: their latest complete front run
// (the main mode the plan judges), else their latest run of any kind.
const people = new Map();
for (const row of rows) {
  const m = row.r.file.meta;
  if (m.scale !== 1 && !flag('--include-fast')) continue;
  const key = m.pseudonym || row.r.path;
  const prev = people.get(key);
  const score = (x) => (x.r.file.meta.camera === 'front' ? 2 : 0) + (x.r.file.meta.ended === 'complete' ? 1 : 0);
  if (!prev || score(row) > score(prev) || (score(row) === score(prev) && row.r.file.meta.created > prev.r.file.meta.created)) people.set(key, row);
}
const P = [...people.values()];
const n = P.length;

// ---------- aggregate "Готово, когда" ----------
const phones = new Map();
for (const row of rows) {
  if ((row.r.file.meta.scale !== 1 && !flag('--include-fast')) || !row.dev.phone) continue;
  phones.set(row.dev.key, row);
}
const iphones = [...phones.values()].filter((x) => x.dev.os === 'iOS').length;
const androids = [...phones.values()].filter((x) => x.dev.os === 'Android').length;
const latencyPhones = new Set(rows.filter((x) => x.dev.phone && x.r.summary.latency.confidence === 'ok' && (x.r.file.meta.scale === 1 || flag('--include-fast'))).map((x) => x.dev.key));
const count = (pred) => P.filter((x) => pred(x.r.summary)).length;
const of8 = (k) => Math.ceil((n * k) / 8); // "k из 8", scaled to n
const failedTwice = count((s) => s.calibration.failedTwice);
const calibMedian = median(P.map((x) => x.r.summary.calibration.firstMs));
const pausesOk = count((s) => s.criteria.falsePausesOk === true);
const steerOk = count((s) => s.criteria.steerNoNeckComplaint);
const funOk = count((s) => s.criteria.wantsMore === true);

const criteria = [
  ['≥ 8 человек', `${n}`, '≥ 8', n >= 8],
  ['≥ 5 телефонов (≥ 2 iPhone, ≥ 2 Android)', `${phones.size} (iPhone ${iphones}, Android ${androids})`, '≥ 5 (2+2)', phones.size >= 5 && iphones >= 2 && androids >= 2],
  ['≤ 1 из 8 дважды не откалибровался', `${failedTwice} из ${n}`, `≤ ${Math.floor(n / 8)}`, n > 0 && failedTwice <= Math.floor(n / 8)],
  ['медиана калибровки ≤ 30 с', sec(calibMedian), '≤ 30s', calibMedian !== null && calibMedian <= 30000],
  ['≥ 7 из 8: ≤ 1 ложной паузы/мин на ровных', `${pausesOk} из ${n}`, `≥ ${of8(7)}`, n > 0 && pausesOk >= of8(7)],
  ['≥ 7 из 8 рулят ±1 без жалоб на шею', `${steerOk} из ${n}`, `≥ ${of8(7)}`, n > 0 && steerOk >= of8(7)],
  ['≥ 6 из 8 хотят ещё (весело ≥ 4)', `${funOk} из ${n}`, `≥ ${of8(6)}`, n > 0 && funOk >= of8(6)],
  ['задержка тела измерена на ≥ 5 телефонах', `${latencyPhones.size}`, '≥ 5', latencyPhones.size >= 5],
  ['Spotify / Яндекс фоном на iOS и Android', 'вручную', '', null],
  ['v0.2 прошёл круг 2', 'вручную', '', null],
];

if (flag('--json')) {
  console.log(JSON.stringify({
    runs: rows.map((x) => ({ file: basename(x.r.path), pseudonym: nameOf(x.r.file.meta.pseudonym), camera: x.r.file.meta.camera, device: x.dev, summary: x.r.summary })),
    people: n,
    criteria: criteria.map(([name, fact, goal, pass]) => ({ name, fact, goal, pass })),
  }, null, 2));
  process.exit(0);
}

console.log(`Plank Run · Этап 0 · полевой отчёт · файлов: ${runs.length}, людей в зачёте: ${n}\n`);
console.log(table(rows.map((x) => x.cells), ['Кто', 'Камера', 'Устройство', 'Делегат', 'Загрузка', 'p50/p95 мс', 'к/с', 'Калибр. 1-я', 'Ложн./мин (все)', 'Руль −/+', 'Шея', 'Весело', 'Задержка', 'Отрезки']));
console.log('\nЗадержка: ⊓ — «двигался на щелчок» (щелчок → середина движения), ∿ — «приходил в долю» (щелчок → крайняя точка); ? — неуверенно.');
console.log('Ложн./мин — отмечено человеком «пауза зря» на ровных отрезках; в скобках — все неожиданные паузы (верхняя граница).');

if (flag('--detail')) {
  for (const x of rows) {
    console.log(`\n${nameOf(x.r.file.meta.pseudonym)} · ${x.r.file.meta.camera} · ${basename(x.r.path)}`);
    console.log(table(x.r.summary.perSegment.map((g) => [
      g.id, g.status, g.variant ?? '—', sec(g.heldMs), g.pauses, g.expectedPauses, g.falsePauses, g.okPct ?? '—',
      `${num(g.x.min, 2)}…${num(g.x.max, 2)}`, `${num(g.y.min, 2)}…${num(g.y.max, 2)}`, num(g.xSpread, 2), num(g.ySpread, 2), num(g.fps), g.standDetectMs ?? '',
    ]), ['Отрезок', 'Итог', 'Вариант', 'Держал', 'Паузы', 'По сцен.', 'Зря', 'ok%', 'x', 'y', 'x p5–95', 'y p5–95', 'к/с', 'Встал→пауза мс']));
    const l = x.r.summary.latency;
    if (l.ms !== null) console.log(`задержка: ${l.ms} мс (${l.method}, r=${l.corr}), до места ${l.arrivalMs ?? '—'} мс, по кадру камеры ${l.captureLagMs ?? '—'} мс, без фильтра ${l.rawLagMs ?? '—'} мс, ${l.confidence}${l.reasons?.length ? ` [${l.reasons.join(', ')}]` : ''}`);
  }
}

console.log('\nГотово, когда (план §12.1)');
console.log(table(criteria.map(([name, fact, goal, pass]) => [name, fact, goal, pass === null ? '—' : mark(pass)]), ['Критерий', 'Факт', 'Цель', 'Итог']));
const med = (f) => median(P.map((x) => f(x.r.summary)));
console.log(`\nСправочно (медианы по людям): загрузка модели ${sec(med((s) => s.perf.loadMs))}, страница ${sec(med((s) => s.perf.pageLoadMs))}, ` +
  `инференс ${num(med((s) => s.perf.inferenceP50))}/${num(med((s) => s.perf.inferenceP95))} мс, ${num(med((s) => s.perf.fps))} к/с, ` +
  `задержка ${med((s) => (s.latency.confidence === 'ok' ? s.latency.ms : null)) ?? '—'} мс, «встал → пауза» ${med((s) => s.standDetectMs) ?? '—'} мс, ` +
  `кивок двигает руль по y на ${num(med((s) => s.nod?.ySpread), 2)}.`);
const speed = P.map((x) => x.r.summary.answers.loadSpeed).filter(Boolean);
if (speed.length) console.log(`Скорость загрузки (ответы): быстро ${speed.filter((v) => v === 'fast').length}, нормально ${speed.filter((v) => v === 'ok').length}, медленно ${speed.filter((v) => v === 'slow').length}.`);
const fast = rows.filter((x) => x.r.file.meta.scale !== 1).length;
if (fast && !flag('--include-fast')) console.log(`\n(${fast} тестовых прогонов ?protocol&fast не входят в зачёт; --include-fast — включить.)`);
