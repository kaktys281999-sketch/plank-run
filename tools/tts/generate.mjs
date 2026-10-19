#!/usr/bin/env node
// Plank Run — voice-coach renderer: Gemini TTS (free tier) → PCM → split → trim
// → loudness normalize → AAC .m4a + manifest.json.  Node 22, no npm deps; needs
// the ffmpeg/ffprobe CLI.  Usage and design notes: tools/tts/README.md (RU).
//
// Free-tier quotas are tiny, so many lines are rendered in ONE request (the
// model reads them with long pauses between them) and the PCM is split by
// silence.  Every raw response and every split line is cached, so re-running
// (other bitrate, other trim, a crashed run) costs no requests.
//
// The API key is read from env GEMINI_API_KEY, or from the file named by
// --key-file / env GEMINI_API_KEY_FILE.  It is never printed or written.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node ≥ 22.21):
// re-run ourselves once with it set when a proxy is configured.
if (IS_MAIN && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const RATE = 24000; // Gemini TTS output: PCM s16le mono 24 kHz

// Bump when the prompt wording changes, so cached lines from an older prompt
// are not mixed with new ones.
const PROMPT_VERSION = 2;
const DEFAULT_STYLE =
  'Style: a friendly fitness coach, energetic but calm, warm and confident. ' +
  'Clear diction, natural Russian, steady medium pace. Voice only, no music, no sound effects.';

// Ten phrases for the voice-choice page (voices/index.html).
export const SAMPLE_PHRASES = [
  'Займи планку лицом к экрану',
  'Отлично. Держи!',
  'Дыши ровно',
  'Подними таз',
  'Ещё десять секунд',
  'Цель достигнута! Отдыхай и дыши',
  'Банка полная! Плюс десять',
  'Не вижу тебя',
  'Вернись в планку',
  'Начинаем проверку. Держи только до сигнала. Любой отрезок можно сделать на коленях или пропустить.',
];

// ---------------------------------------------------------------- CLI ------

const HELP = `node tools/tts/generate.mjs [options]

  --voice <name[,name…]>   Gemini voice(s), e.g. Kore or Kore,Puck   (Kore)
  --lines <ids|all>        comma-separated line ids from the line table (all)
  --model <id>             gemini-3.1-flash-tts-preview | gemini-2.5-flash-preview-tts
  --out <dir>              output root (assets/voice; voices/samples with --samples)
  --samples                render the 10 voice-choice phrases → <out>/<voice>/<n>.m4a
  --lines-file <path>      line table (js/voice-lines.js)
  --batch <n>              lines per request (12)
  --style <text> | --no-style   English style direction for the model
  --bitrate <b>            AAC bitrate (40k, as in spec-visual-art §8.1)
  --lufs <n> --tp <n>      loudness target / true-peak ceiling (-16 / -1.5)
  --pad-ms <n>             silence kept before/after speech (40)
  --default <voice>        set manifest "default" (first voice if unset)
  --min-interval <s>       seconds between request starts (21)
  --max-requests <n>       hard cap on API requests this run (20)
  --cache <dir>            response cache (${path.join(os.tmpdir(), 'plank-run-tts-cache')})
  --key-file <path>        file with the API key (or env GEMINI_API_KEY[_FILE])
  --force                  re-encode even if the .m4a exists
  --fresh                  ignore cached responses (costs requests)
  --dry-run                show batches and prompts, send nothing
  --check                  quality report on what is already rendered (no API)
`;

function parseArgs(argv) {
  const o = {
    voice: 'Kore', lines: 'all', model: 'gemini-3.1-flash-tts-preview', out: null,
    samples: false, linesFile: 'js/voice-lines.js', batch: 12, style: DEFAULT_STYLE,
    bitrate: '40k', lufs: -16, tp: -1.5, padMs: 40, default: null, minInterval: 21,
    maxRequests: 20, cache: path.join(os.tmpdir(), 'plank-run-tts-cache'), keyFile: null,
    force: false, fresh: false, dryRun: false, check: false,
  };
  const flags = { '--samples': 'samples', '--force': 'force', '--fresh': 'fresh', '--dry-run': 'dryRun', '--check': 'check' };
  const vals = {
    '--voice': 'voice', '--lines': 'lines', '--model': 'model', '--out': 'out', '--lines-file': 'linesFile',
    '--batch': 'batch', '--style': 'style', '--bitrate': 'bitrate', '--lufs': 'lufs', '--tp': 'tp',
    '--pad-ms': 'padMs', '--default': 'default', '--min-interval': 'minInterval',
    '--max-requests': 'maxRequests', '--cache': 'cache', '--key-file': 'keyFile',
  };
  const nums = new Set(['batch', 'lufs', 'tp', 'padMs', 'minInterval', 'maxRequests']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let v;
    if (a.includes('=')) [a, v] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    if (a === '--no-style') { o.style = ''; continue; }
    if (flags[a]) { o[flags[a]] = true; continue; }
    if (vals[a]) {
      if (v === undefined) v = argv[++i];
      if (v === undefined) die(`missing value for ${a}`);
      o[vals[a]] = nums.has(vals[a]) ? Number(v) : v;
      continue;
    }
    die(`unknown argument ${a}\n\n${HELP}`);
  }
  if (!o.out) o.out = o.samples ? 'voices/samples' : 'assets/voice';
  o.voices = String(o.voice).split(',').map((s) => s.trim()).filter(Boolean);
  return o;
}

// ------------------------------------------------------------ helpers ------

let SECRET = '';
const redact = (s) => (SECRET ? String(s).split(SECRET).join('***') : String(s));
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a.map(redact));
const warn = (...a) => console.warn(`[${ts()}] !`, ...a.map(redact));
function die(msg) { console.error(redact(`error: ${msg}`)); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s, n = 16) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const letters = (t) => (t.toLowerCase().match(/[a-zа-яё0-9]/g) ?? []).length;

function readKey(o) {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = o.keyFile ?? process.env.GEMINI_API_KEY_FILE;
  if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  die('no API key: set GEMINI_API_KEY, GEMINI_API_KEY_FILE or --key-file');
}

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout, err: r.stderr?.toString() ?? '' };
}

// Line table: `export const LINES|VOICE_LINES = { id: 'text', … }` (no imports).
async function loadLines(file) {
  const src = fs.readFileSync(abs(file), 'utf8');
  try {
    const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
    const table = mod.LINES ?? mod.VOICE_LINES ?? Object.values(mod).find((v) => v && typeof v === 'object' && !Array.isArray(v));
    if (table) return { ...table };
  } catch (e) {
    warn(`import of ${file} failed (${e.message}); falling back to regex`);
  }
  const out = {};
  for (const m of src.matchAll(/^\s*([A-Za-z_][\w]*)\s*:\s*(['"])((?:\\.|(?!\2).)*)\2\s*,?\s*$/gm)) out[m[1]] = m[3];
  return out;
}

// --------------------------------------------------------------- PCM -------

const toInt16 = (buf) => new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length & ~1)));

function wav(int16, rate = RATE) {
  const data = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// 10 ms frame energies in dBFS + a loud reference level (95th percentile).
function frames(x, rate = RATE) {
  const hop = Math.round(rate / 100);
  const n = Math.floor(x.length / hop);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += (x[j] / 32768) ** 2;
    db[i] = 10 * Math.log10(s / hop + 1e-12);
  }
  const loud = Array.from(db).filter((v) => v > -70).sort((a, b) => a - b);
  const ref = loud.length ? loud[Math.floor(loud.length * 0.95)] : -20;
  return { hop, db, ref };
}

// Speech mask: frame ≥ thr; weak short islands (breaths, clicks) are not speech.
function speechMask(db, thr, ref) {
  const m = Array.from(db, (v) => v >= thr);
  for (let i = 0; i < m.length; ) {
    if (!m[i]) { i++; continue; }
    let j = i; let peak = -200;
    while (j < m.length && m[j]) peak = Math.max(peak, db[j++]);
    const len = j - i;
    if (len < 6 || (peak < ref - 16 && len < 50)) for (let k = i; k < j; k++) m[k] = false;
    i = j;
  }
  return m;
}

function gapsOf(mask) {
  const first = mask.indexOf(true);
  const last = mask.lastIndexOf(true);
  const gaps = [];
  if (first < 0) return { first, last, gaps };
  for (let i = first; i <= last; ) {
    if (mask[i]) { i++; continue; }
    let j = i;
    while (j <= last && !mask[j]) j++;
    gaps.push({ start: i, end: j, len: j - i });
    i = j;
  }
  return { first, last, gaps };
}

// Expected spoken length (s) — only used relatively, to catch a wrong split.
const expectedSec = (t) => 0.25 + 0.065 * letters(t) + 0.3 * (t.match(/[.!?…,—–-]\s+\S/g) ?? []).length;

// Trim one segment [a, b) (samples) to speech ± pad.
function trimSegment(x, a, b, ref, padMs) {
  const seg = x.subarray(a, b);
  const { hop, db } = frames(seg);
  const thr = ref - 42;
  let f = 0; while (f < db.length && db[f] < thr) f++;
  let l = db.length - 1; while (l >= 0 && db[l] < thr) l--;
  if (f > l) return null;
  const pad = Math.round((RATE * padMs) / 1000);
  const s = Math.max(0, f * hop - pad);
  const e = Math.min(seg.length, (l + 1) * hop + pad);
  return { pcm: seg.slice(s, e), onsetMs: Math.round(((f * hop - s) / RATE) * 1000) };
}

// Choose N−1 of the pauses as line breaks.  Dynamic programming over
// (line, pause): reward long pauses, penalize clips whose length does not fit
// their text (relative to a speaking-rate factor k, searched on a grid).
// Returns the cut pauses plus a confidence margin: how much the score drops if
// any single cut moves to another pause between its neighbours.
function alignCuts(gaps, first, last, texts) {
  const N = texts.length;
  const G = gaps.length;
  const exp = texts.map(expectedSec);
  const gain = (g) => 2 * Math.log((g.len * 10) / 300);
  const fit = (a, b, i, k) => { const r = Math.log((b - a) / 100 / (k * exp[i])); return (r * r) / 0.09; };
  const score = (cuts, k) => {
    let s = 0;
    for (let i = 0; i < N; i++) {
      const a = i ? gaps[cuts[i - 1]].end : first;
      const b = i < N - 1 ? gaps[cuts[i]].start : last + 1;
      if (b <= a) return -Infinity;
      s -= fit(a, b, i, k);
      if (i < N - 1) s += gain(gaps[cuts[i]]);
    }
    return s;
  };
  const longest = [...gaps].sort((a, b) => b.len - a.len).slice(0, N - 1).reduce((s, g) => s + g.len, 0);
  const k0 = (last + 1 - first - longest) / 100 / exp.reduce((s, v) => s + v, 0);
  let best = null;
  for (let step = -6; step <= 6; step++) {
    const k = k0 * 1.06 ** step;
    // f[i][j]: best score with cut i (between line i and i+1) at pause j.
    const f = Array.from({ length: N - 1 }, () => new Float64Array(G).fill(-Infinity));
    const from = Array.from({ length: N - 1 }, () => new Int32Array(G).fill(-1));
    for (let j = 0; j < G; j++) f[0][j] = gain(gaps[j]) - fit(first, gaps[j].start, 0, k);
    for (let i = 1; i < N - 1; i++) {
      for (let j = i; j < G; j++) {
        for (let p = i - 1; p < j; p++) {
          const v = f[i - 1][p] + gain(gaps[j]) - fit(gaps[p].end, gaps[j].start, i, k);
          if (v > f[i][j]) { f[i][j] = v; from[i][j] = p; }
        }
      }
    }
    let bj = -1; let bv = -Infinity;
    for (let j = N - 2; j < G; j++) {
      const v = f[N - 2][j] - fit(gaps[j].end, last + 1, N - 1, k);
      if (v > bv) { bv = v; bj = j; }
    }
    if (bj < 0 || !Number.isFinite(bv)) continue;
    const cuts = [bj];
    for (let i = N - 2; i > 0; i--) cuts.unshift(from[i][cuts[0]]);
    if (!best || bv > best.score) best = { cuts, k, score: bv };
  }
  if (!best) return null;
  let margin = Infinity;
  for (let i = 0; i < N - 1; i++) {
    const lo = i ? best.cuts[i - 1] + 1 : 0;
    const hi = i < N - 2 ? best.cuts[i + 1] - 1 : G - 1;
    for (let j = lo; j <= hi; j++) {
      if (j === best.cuts[i]) continue;
      const alt = [...best.cuts];
      alt[i] = j;
      margin = Math.min(margin, best.score - score(alt, best.k));
    }
  }
  return { ...best, margin };
}

// Split a batch into texts.length clips: align line breaks to pauses (above),
// then verify the confidence margin and that every clip's length fits its
// text.  Tries a few speech thresholds; any failure → caller re-requests the
// batch in halves.
function splitBatch(pcmBuf, texts, padMs) {
  const x = toInt16(pcmBuf);
  const { hop, db, ref } = frames(x);
  const N = texts.length;
  let lastErr = 'no speech';
  for (const off of [32, 26, 38, 22]) {
    const mask = speechMask(db, ref - off, ref);
    const { first, last, gaps: all } = gapsOf(mask);
    if (first < 0) { lastErr = 'no speech'; continue; }
    let cuts = [];
    let note = '';
    if (N > 1) {
      const gaps = all.filter((g) => g.len >= 15);
      if (gaps.length < N - 1) { lastErr = `${gaps.length + 1} speech parts for ${N} lines`; continue; }
      const al = alignCuts(gaps, first, last, texts);
      if (!al) { lastErr = 'no alignment'; continue; }
      const chosen = al.cuts.map((j) => gaps[j]);
      const minBreak = Math.min(...chosen.map((g) => g.len));
      if (minBreak < 25 || al.margin < 1.5) {
        lastErr = `ambiguous line breaks (shortest ${minBreak * 10} ms, margin ${al.margin.toFixed(2)})`;
        continue;
      }
      note = `, shortest break ${minBreak * 10} ms, margin ${al.margin.toFixed(1)}`;
      cuts = chosen.map((g) => Math.round(((g.start + g.end) / 2) * hop));
    }
    const bounds = [Math.max(0, first * hop - hop * 20), ...cuts, Math.min(x.length, (last + 1) * hop + hop * 20)];
    const segs = [];
    for (let i = 0; i < N; i++) segs.push(trimSegment(x, bounds[i], bounds[i + 1], ref, padMs));
    if (segs.some((s) => !s)) { lastErr = 'empty segment'; continue; }
    const ratios = segs.map((s, i) => s.pcm.length / RATE / expectedSec(texts[i]));
    const k = [...ratios].sort((a, b) => a - b)[Math.floor(N / 2)];
    const bad = ratios.map((r, i) => [r / k, i]).filter(([r]) => r < 0.5 || r > 1.9);
    if (N > 1 && bad.length) {
      lastErr = `clip length does not fit text: ${bad.map(([r, i]) => `#${i + 1} ×${r.toFixed(2)}`).join(', ')}`;
      continue;
    }
    return { ok: true, segs, info: `thr ref-${off} dB, ${all.length} pauses, k=${k.toFixed(2)}${note}` };
  }
  return { ok: false, err: lastErr };
}

// ------------------------------------------------------------- ffmpeg ------

function measure(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=20:print_format=json', '-f', 'null', '-']);
  const j = r.err.slice(r.err.lastIndexOf('{'));
  try {
    const m = JSON.parse(j.slice(0, j.indexOf('}') + 1));
    return { i: Number(m.input_i), tp: Number(m.input_tp) };
  } catch { return { i: NaN, tp: NaN }; }
}

function peakDb(int16) {
  let p = 0;
  for (const v of int16) p = Math.max(p, Math.abs(v));
  return 20 * Math.log10(p / 32768 + 1e-12);
}

function rmsDb(int16) {
  let s = 0;
  for (const v of int16) s += (v / 32768) ** 2;
  return 10 * Math.log10(s / Math.max(1, int16.length) + 1e-12);
}

// Two-pass loudness: measure (EBU R128) → linear gain to target → lookahead
// limiter only if the gain would push the true peak over the ceiling → 3 ms
// fades → AAC-LC mono .m4a.
function encodeClip(int16, outFile, o, tmpDir) {
  const tmp = path.join(tmpDir, `clip-${process.pid}-${sha(outFile, 8)}.wav`);
  fs.writeFileSync(tmp, wav(int16));
  const m = measure(tmp);
  let gain = Number.isFinite(m.i) && m.i > -60 ? o.lufs - m.i : o.lufs - (rmsDb(int16) + 3);
  gain = Math.max(-20, Math.min(30, gain));
  const dur = int16.length / RATE;
  const af = [`volume=${gain.toFixed(2)}dB`];
  const tp = Number.isFinite(m.tp) ? m.tp : peakDb(int16);
  const limited = tp + gain > o.tp - 0.3;
  if (limited) af.push(`alimiter=limit=${(10 ** ((o.tp - 0.5) / 20)).toFixed(4)}:attack=1:release=60:level=0:latency=1`);
  af.push('afade=t=in:d=0.003', `afade=t=out:st=${Math.max(0, dur - 0.003).toFixed(4)}:d=0.003`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', af.join(','),
    '-c:a', 'aac', '-b:a', o.bitrate, '-ac', '1', '-ar', String(RATE), '-map_metadata', '-1',
    '-movflags', '+faststart', outFile]);
  fs.rmSync(tmp, { force: true });
  if (r.code !== 0) throw new Error(`ffmpeg failed for ${rel(outFile)}: ${r.err.slice(-400)}`);
  return { ms: Math.round(dur * 1000), gain, limited, inI: m.i };
}

function decode(file) {
  const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-']);
  return toInt16(r.out);
}

// Median F0 (Hz) of voiced frames — a cheap "does it sound like the voice we
// asked for" check (male ≈ 85–155 Hz, female ≈ 165–255 Hz).
function medianF0(x, rate = RATE) {
  const d = 3; const sr = rate / d; // crude decimation to 8 kHz
  const y = new Float32Array(Math.floor(x.length / d));
  for (let i = 0; i < y.length; i++) y[i] = (x[i * d] + x[i * d + 1] + x[i * d + 2]) / 3 / 32768;
  const win = Math.round(sr * 0.04); const hop = Math.round(sr * 0.01);
  const minLag = Math.floor(sr / 400); const maxLag = Math.ceil(sr / 70);
  const f0 = [];
  for (let s = 0; s + win + maxLag < y.length; s += hop) {
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += y[s + i] ** 2;
    if (Math.sqrt(e0 / win) < 0.02) continue;
    let best = 0; let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0; let e1 = 0;
      for (let i = 0; i < win; i++) { c += y[s + i] * y[s + i + lag]; e1 += y[s + i + lag] ** 2; }
      const r = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best > 0.75) f0.push(sr / bestLag);
  }
  if (!f0.length) return NaN;
  f0.sort((a, b) => a - b);
  return f0[Math.floor(f0.length / 2)];
}

// ------------------------------------------------------------ the API ------

class QuotaExhausted extends Error {}
class BudgetExceeded extends Error {}

function makeClient(o) {
  const reqLog = path.join(o.cache, 'requests.jsonl');
  const state = { sent: 0, ok: 0, lastStart: 0 };
  try { // pace across runs too
    const lines = fs.readFileSync(reqLog, 'utf8').trim().split('\n');
    state.lastStart = Date.parse(JSON.parse(lines.at(-1)).t) || 0;
  } catch {}
  const note = (rec) => fs.appendFileSync(reqLog, `${JSON.stringify({ t: new Date().toISOString(), ...rec })}\n`);

  function parse429(txt) {
    let retry = 0; let perDay = false; const ids = [];
    try {
      const j = JSON.parse(txt);
      for (const d of j.error?.details ?? []) {
        if (d.retryDelay) retry = parseFloat(d.retryDelay) || 0;
        for (const v of d.violations ?? []) {
          const id = `${v.quotaId ?? v.quotaMetric ?? ''}${v.quotaValue ? ` (limit ${v.quotaValue})` : ''}`;
          ids.push(id);
          if (/PerDay/i.test(v.quotaId ?? '')) perDay = true;
        }
      }
    } catch {}
    return { retry, perDay, ids };
  }

  async function tts(model, voice, prompt, meta) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (state.sent >= o.maxRequests) throw new BudgetExceeded(`--max-requests ${o.maxRequests} reached`);
      const wait = state.lastStart + o.minInterval * 1000 - Date.now();
      if (wait > 0) { log(`  pacing: waiting ${Math.ceil(wait / 1000)} s`); await sleep(wait); }
      state.lastStart = Date.now();
      state.sent++;
      const t0 = Date.now();
      let res; let txt;
      try {
        res = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': SECRET },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
          }),
          signal: AbortSignal.timeout(300_000),
        });
        txt = await res.text();
      } catch (e) {
        note({ model, voice, ...meta, status: 'net', err: redact(e.message) });
        warn(`  network error (${redact(e.cause?.code ?? e.message)}), retry in ${15 * attempt} s`);
        await sleep(15_000 * attempt);
        continue;
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (res.ok) {
        let j;
        try { j = JSON.parse(txt); } catch { j = {}; }
        const cand = j.candidates?.[0];
        const parts = cand?.content?.parts ?? [];
        const bufs = parts.filter((p) => p.inlineData?.data).map((p) => Buffer.from(p.inlineData.data, 'base64'));
        if (bufs.length) {
          state.ok++;
          const pcm = Buffer.concat(bufs);
          note({ model, voice, ...meta, status: 200, sec: Number(secs), audioSec: +(pcm.length / 2 / RATE).toFixed(1), tokens: j.usageMetadata?.candidatesTokenCount });
          log(`  200 in ${secs} s → ${(pcm.length / 2 / RATE).toFixed(1)} s audio (${parts[0].inlineData.mimeType})`);
          return pcm;
        }
        note({ model, voice, ...meta, status: 'noaudio', finish: cand?.finishReason });
        warn(`  200 without audio (finishReason ${cand?.finishReason ?? '?'}${j.promptFeedback?.blockReason ? `, block ${j.promptFeedback.blockReason}` : ''}), retry`);
        await sleep(5000);
        continue;
      }
      if (res.status === 429) {
        const q = parse429(txt);
        note({ model, voice, ...meta, status: 429, quota: q.ids, retry: q.retry });
        warn(`  429 quota: ${q.ids.join('; ') || 'rate limited'}${q.retry ? `, retryDelay ${q.retry} s` : ''}`);
        if (q.perDay) throw new QuotaExhausted(`daily quota exhausted for ${model} (${q.ids.join('; ')})`);
        const w = Math.max(q.retry + 2, 20 * attempt);
        log(`  backing off ${Math.round(w)} s`);
        await sleep(w * 1000);
        continue;
      }
      let msg = txt.slice(0, 300);
      try { msg = JSON.parse(txt).error?.message ?? msg; } catch {}
      note({ model, voice, ...meta, status: res.status, err: redact(msg) });
      if (res.status >= 500) { warn(`  HTTP ${res.status} ${redact(msg)}; retry in ${20 * attempt} s`); await sleep(20_000 * attempt); continue; }
      throw new Error(`HTTP ${res.status}: ${redact(msg)}`);
    }
    throw new Error('gave up after 5 attempts');
  }
  return { tts, state };
}

// ---------------------------------------------------------- prompting ------

function pauseTag(model) { return /gemini-3/.test(model) ? '[long pause]' : ''; }

function buildPrompt(texts, o) {
  const notes = [];
  if (o.style) notes.push(o.style);
  if (texts.length > 1) {
    notes.push('Format: every transcript line is a separate short cue. Read the lines in order, exactly as written, ' +
      'and leave about two seconds of silence after each line. Read only the transcript.');
  } else {
    notes.push('Read only the transcript, exactly as written.');
  }
  const tag = pauseTag(o.model);
  const body = texts.join(tag ? `\n${tag}\n` : '\n\n');
  return `### DIRECTOR'S NOTES\n${notes.join('\n')}\n\n#### TRANSCRIPT\n${body}\n`;
}

// Cache key for one rendered line (voice + model + style + text).
const lineKey = (o, voice, text) => sha(JSON.stringify([PROMPT_VERSION, o.model, voice, o.style, text]), 24);

// Render texts for one voice: cache → batches → split → fallback to halves.
async function renderTexts(o, client, voice, texts) {
  const dir = path.join(o.cache, 'lines');
  const rawDir = path.join(o.cache, 'raw');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const result = new Map(); // text → {pcm:Int16Array, onsetMs}
  const todo = [];
  for (const t of new Set(texts)) {
    const f = path.join(dir, `${lineKey(o, voice, t)}.json`);
    if (!o.fresh && fs.existsSync(f)) {
      const meta = JSON.parse(fs.readFileSync(f, 'utf8'));
      result.set(t, { pcm: toInt16(fs.readFileSync(f.replace(/\.json$/, '.pcm'))), onsetMs: meta.onsetMs });
    } else todo.push(t);
  }
  if (texts.length && todo.length < new Set(texts).size) log(`  ${voice}: ${new Set(texts).size - todo.length} line(s) from cache`);

  const queue = [];
  for (let i = 0; i < todo.length; i += o.batch) queue.push(todo.slice(i, i + o.batch));
  const missing = [];
  while (queue.length) {
    const batch = queue.shift();
    const prompt = buildPrompt(batch, o);
    if (o.dryRun) { log(`  [dry-run] ${voice} batch of ${batch.length}:\n${prompt}`); continue; }
    const rkey = sha(JSON.stringify([o.model, voice, prompt]), 24);
    const rawFile = path.join(rawDir, `${rkey}.pcm`);
    let pcm;
    if (!o.fresh && fs.existsSync(rawFile)) {
      pcm = fs.readFileSync(rawFile);
      log(`  ${voice}: batch of ${batch.length} from raw cache`);
    } else {
      log(`  ${voice}: request — ${batch.length} line(s), ${batch.reduce((s, t) => s + t.length, 0)} chars`);
      try {
        pcm = await client.tts(o.model, voice, prompt, { lines: batch.length });
      } catch (e) {
        if (e instanceof QuotaExhausted || e instanceof BudgetExceeded) {
          warn(e.message);
          missing.push(batch, ...queue);
          return { result, missing: missing.flat(), stopped: e.message };
        }
        throw e;
      }
      fs.writeFileSync(rawFile, pcm);
      fs.writeFileSync(rawFile.replace(/\.pcm$/, '.json'), JSON.stringify({ model: o.model, voice, texts: batch, prompt, t: new Date().toISOString() }, null, 1));
    }
    const sp = splitBatch(pcm, batch, o.padMs);
    if (!sp.ok) {
      warn(`  ${voice}: split failed (${sp.err})`);
      if (batch.length === 1) { missing.push(batch[0]); continue; }
      const h = Math.ceil(batch.length / 2);
      queue.unshift(batch.slice(0, h), batch.slice(h));
      log(`  ${voice}: falling back to batches of ${h} and ${batch.length - h}`);
      continue;
    }
    log(`  ${voice}: split OK into ${batch.length} (${sp.info})`);
    batch.forEach((t, i) => {
      const s = sp.segs[i];
      const base = path.join(dir, lineKey(o, voice, t));
      fs.writeFileSync(`${base}.pcm`, Buffer.from(s.pcm.buffer, s.pcm.byteOffset, s.pcm.byteLength));
      fs.writeFileSync(`${base}.json`, JSON.stringify({ text: t, voice, model: o.model, onsetMs: s.onsetMs, raw: rkey }));
      result.set(t, s);
    });
  }
  return { result, missing };
}

// --------------------------------------------------------------- modes -----

function today() { return new Date().toISOString().slice(0, 10); }

async function modeLines(o, client) {
  const table = await loadLines(o.linesFile);
  const ids = o.lines === 'all' ? Object.keys(table) : o.lines.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !(id in table));
  if (unknown.length) die(`unknown line id(s): ${unknown.join(', ')}`);
  const outRoot = abs(o.out);
  const manFile = path.join(outRoot, 'manifest.json');
  const man = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : { voices: {} };
  man.voices ??= {};
  const report = { missing: [], stopped: null };
  for (const voice of o.voices) {
    const entries = (man.voices[voice] ??= {});
    const need = ids.filter((id) => {
      const e = entries[id];
      return o.force || o.fresh || !e || e.text !== table[id] || e.model && e.model !== o.model || !fs.existsSync(abs(e.file));
    });
    log(`${voice}: ${ids.length} line(s), ${ids.length - need.length} up to date, ${need.length} to render`);
    if (!need.length) continue;
    const { result, missing, stopped } = await renderTexts(o, client, voice, need.map((id) => table[id]));
    if (o.dryRun) continue;
    for (const id of need) {
      const r = result.get(table[id]);
      if (!r) { report.missing.push(`${voice}/${id}`); continue; }
      const file = path.join(outRoot, voice, `${id}.m4a`);
      const enc = encodeClip(r.pcm, file, o, o.cache);
      entries[id] = {
        file: rel(file), text: table[id], ms: enc.ms, onsetMs: r.onsetMs,
        hash: sha(fs.readFileSync(file), 12),
      };
      log(`  ✓ ${rel(file)}  ${enc.ms} ms  gain ${enc.gain.toFixed(1)} dB${enc.limited ? ' +limiter' : ''}`);
    }
    if (missing.length) log(`${voice}: not rendered: ${missing.length} line(s)`);
    if (stopped) { report.stopped = stopped; }
    // keep ids in table order
    man.voices[voice] = Object.fromEntries(Object.keys(table).filter((id) => entries[id]).map((id) => [id, entries[id]])
      .concat(Object.entries(entries).filter(([id]) => !(id in table))));
    if (stopped) break;
  }
  if (o.dryRun) return report;
  const out = {
    default: o.default ?? man.default ?? o.voices[0],
    model: o.model,
    generated: today(),
    format: `AAC-LC .m4a, mono, ${RATE} Hz, ${o.bitrate}bps, ${o.lufs} LUFS, true peak ≤ ${o.tp} dBTP, ${o.padMs} ms pad`,
    style: o.style,
    voices: man.voices,
  };
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(manFile, `${JSON.stringify(out, null, 2)}\n`);
  log(`manifest → ${rel(manFile)}`);
  return report;
}

async function modeSamples(o, client) {
  const outRoot = abs(o.out);
  const indexFile = path.join(outRoot, 'samples.json');
  const idx = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { voices: {} };
  const report = { missing: [], stopped: null };
  for (const voice of o.voices) {
    const done = SAMPLE_PHRASES.every((_, i) => fs.existsSync(path.join(outRoot, voice, `${i + 1}.m4a`)));
    if (done && !o.force && !o.fresh && idx.voices?.[voice]?.model === o.model) { log(`${voice}: samples up to date`); continue; }
    log(`${voice}: rendering ${SAMPLE_PHRASES.length} sample phrases`);
    let res;
    try {
      res = await renderTexts(o, client, voice, SAMPLE_PHRASES);
    } catch (e) {
      warn(`${voice}: ${e.message}`);
      idx.voices[voice] = { ok: false, error: e.message, model: o.model };
      report.missing.push(...SAMPLE_PHRASES.map((_, i) => `${voice}/${i + 1}`));
      continue;
    }
    if (o.dryRun) continue;
    const ms = [];
    SAMPLE_PHRASES.forEach((t, i) => {
      const r = res.result.get(t);
      if (!r) { report.missing.push(`${voice}/${i + 1}`); ms.push(null); return; }
      const enc = encodeClip(r.pcm, path.join(outRoot, voice, `${i + 1}.m4a`), o, o.cache);
      ms.push(enc.ms);
    });
    idx.voices[voice] = { ok: ms.every(Boolean), model: o.model, ms };
    log(`${voice}: ${ms.filter(Boolean).length}/${SAMPLE_PHRASES.length} saved (${ms.map((v) => v ?? '–').join(', ')} ms)`);
    if (res.stopped) { report.stopped = res.stopped; break; }
  }
  if (o.dryRun) return report;
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(indexFile, `${JSON.stringify({ generated: today(), style: o.style, phrases: SAMPLE_PHRASES, voices: idx.voices }, null, 2)}\n`);
  return report;
}

// Quality report for everything under --out (no API calls).
function modeCheck(o) {
  const outRoot = abs(o.out);
  const rows = [];
  if (o.samples) {
    const idx = JSON.parse(fs.readFileSync(path.join(outRoot, 'samples.json'), 'utf8'));
    for (const voice of Object.keys(idx.voices)) {
      idx.phrases.forEach((t, i) => rows.push({ voice, id: String(i + 1), text: t, file: path.join(outRoot, voice, `${i + 1}.m4a`) }));
    }
  } else {
    const man = JSON.parse(fs.readFileSync(path.join(outRoot, 'manifest.json'), 'utf8'));
    for (const [voice, entries] of Object.entries(man.voices)) {
      for (const [id, e] of Object.entries(entries)) rows.push({ voice, id, text: e.text, file: abs(e.file), ms: e.ms });
    }
  }
  let total = 0;
  const flagged = [];
  const perVoice = {};
  for (const r of rows) {
    if (!fs.existsSync(r.file)) { r.flags = ['MISSING']; flagged.push(r); continue; }
    r.size = fs.statSync(r.file).size;
    total += r.size;
    const x = decode(r.file);
    r.dur = x.length / RATE;
    r.peak = peakDb(x);
    r.loud = measure(r.file);
    r.f0 = medianF0(x);
    r.spc = r.dur / Math.max(1, letters(r.text));
    r.ratio = r.dur / expectedSec(r.text);
    (perVoice[r.voice] ??= []).push(r);
  }
  for (const list of Object.values(perVoice)) {
    const med = [...list.map((r) => r.ratio)].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const f0s = list.map((r) => r.f0).filter(Number.isFinite).sort((a, b) => a - b);
    const f0med = f0s[Math.floor(f0s.length / 2)];
    for (const r of list) {
      r.flags = [];
      if (r.dur < 0.25) r.flags.push('EMPTY/too short');
      if (r.peak > -0.5 || r.loud.tp > -1.0) r.flags.push(`clip? peak ${r.peak.toFixed(1)} dBFS, TP ${r.loud.tp.toFixed(1)}`);
      if (Number.isFinite(r.loud.i) && Math.abs(r.loud.i - o.lufs) > 2.5 && r.dur >= 0.4) r.flags.push(`loudness ${r.loud.i.toFixed(1)} LUFS`);
      if (r.ratio / med < 0.6 || r.ratio / med > 1.6) r.flags.push(`duration ×${(r.ratio / med).toFixed(2)} vs. voice norm`);
      if (Number.isFinite(r.f0) && f0med && Math.abs(Math.log2(r.f0 / f0med)) > 0.6) r.flags.push(`F0 ${Math.round(r.f0)} Hz vs. ${Math.round(f0med)}`);
      if (r.flags.length) flagged.push(r);
    }
    list.f0med = f0med;
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n${pad('voice/id', 26)} ${pad('ms', 6)} ${pad('s/char', 7)} ${pad('LUFS', 6)} ${pad('TP', 6)} ${pad('F0', 5)} ${pad('KB', 5)} text`);
  for (const r of rows) {
    if (!r.size) { console.log(`${pad(`${r.voice}/${r.id}`, 26)} MISSING`); continue; }
    const bar = '█'.repeat(Math.round(r.dur * 4));
    console.log(`${pad(`${r.voice}/${r.id}`, 26)} ${pad(Math.round(r.dur * 1000), 6)} ${pad(r.spc.toFixed(3), 7)} ${pad(r.loud.i.toFixed(1), 6)} ${pad(r.loud.tp.toFixed(1), 6)} ${pad(Number.isFinite(r.f0) ? Math.round(r.f0) : '–', 5)} ${pad((r.size / 1024).toFixed(1), 5)} ${bar} ${r.text.length > 48 ? `${r.text.slice(0, 46)}…` : r.text}${r.flags.length ? `  ⚠ ${r.flags.join('; ')}` : ''}`);
  }
  console.log('\nper voice:');
  for (const [v, list] of Object.entries(perVoice)) {
    const spc = list.map((r) => r.spc).sort((a, b) => a - b);
    console.log(`  ${pad(v, 8)} clips ${list.length}, median F0 ${Math.round(list.f0med) || '–'} Hz, s/char median ${spc[Math.floor(spc.length / 2)].toFixed(3)} (${spc[0].toFixed(3)}–${spc.at(-1).toFixed(3)}), ${(list.reduce((s, r) => s + r.size, 0) / 1024).toFixed(0)} KB`);
  }
  console.log(`\ntotal: ${rows.length} clips, ${(total / 1024).toFixed(0)} KB (${(total / 1048576).toFixed(2)} MB)`);
  console.log(flagged.length ? `suspicious (${flagged.length}):\n${flagged.map((r) => `  ${r.voice}/${r.id}: ${r.flags.join('; ')} — «${r.text}»`).join('\n')}` : 'suspicious: none');
  return { rows, flagged, total };
}

// ---------------------------------------------------------------- main -----

async function main() {
  const o = parseArgs(process.argv.slice(2));
  o.cache = path.resolve(o.cache);
  fs.mkdirSync(o.cache, { recursive: true });
  if (o.check) { modeCheck(o); return; }
  for (const bin of ['ffmpeg', 'ffprobe']) if (run(bin, ['-version']).code !== 0) die(`${bin} not found`);
  if (!o.dryRun) SECRET = readKey(o);
  const client = makeClient(o);
  log(`model ${o.model}, voices ${o.voices.join(', ')}, out ${o.out}, batch ≤ ${o.batch}, cache ${o.cache}`);
  const report = o.samples ? await modeSamples(o, client) : await modeLines(o, client);
  log(`requests this run: ${client.state.sent} sent, ${client.state.ok} with audio`);
  if (report.missing.length) log(`MISSING (${report.missing.length}): ${report.missing.join(', ')}`);
  if (report.stopped) { log(`stopped early: ${report.stopped}. Re-run later; finished clips are kept and cached.`); process.exitCode = 2; }
}

if (IS_MAIN) main().catch((e) => die(e.stack ?? e.message));

export { splitBatch, alignCuts, frames, toInt16, expectedSec, medianF0, decode, measure };
