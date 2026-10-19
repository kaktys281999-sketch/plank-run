// Records a protocol run as DERIVED NUMBERS ONLY (plan D16): analyzer outputs
// at ≤ 30 Hz plus timestamped events. Never stored: video frames, images,
// face boxes in pixels, body landmarks. Face position is kept in face widths
// relative to the calibrated baseline, the side view as angles and ratios.
//
// Samples are columnar ({t: [...], x: [...], ...}) and rounded: an 8-minute
// run is ~10k rows, a few hundred KB of JSON, ~100 KB gzipped.

export const PHASES = ['check', 'intro', 'calibrate', 'countdown', 'hold', 'rest', 'end'];
export const ISSUES = [null, 'lost', 'noFace', 'notVisible', 'tooFar', 'moved', 'standing', 'noSupport', 'sag', 'pike', 'knees', 'lying'];

// [column, decimals]. Shared columns first, then per camera mode.
const BASE = [['t', 0], ['seg', 0], ['ph', 0], ['pr', 0], ['ok', 0], ['iss', 0], ['x', 3], ['y', 3], ['ms', 1], ['cl', 0]];
export const COLUMNS = {
  // dx, dy: face centre − baseline, in baseline face widths (raw, before the filter);
  // sc: face size / baseline; ff: face width / frame width; fsc: detector score.
  front: [...BASE, ['dx', 3], ['dy', 3], ['sc', 3], ['ff', 4], ['fsc', 2]],
  // ang: body angle (deg), hip: hip offset from the shoulder–ankle line (body lengths),
  // dev: hip offset relative to the calibrated line, knee: knee drop, fb: forward/back, vis: visibility.
  side: [...BASE, ['ang', 1], ['hip', 4], ['dev', 4], ['knee', 4], ['fb', 4], ['vis', 2]],
};

const FULL_PERIOD = 1000 / 30; // ≤ 30 Hz while it matters (calibration, countdown, hold)
const SLOW_PERIOD = 1000 / 5;  // 5 Hz otherwise (intro, rest)
const JITTER = 6;              // ms of camera jitter tolerated without dropping a frame

const round = (v, d) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

export class Recorder {
  constructor(camera, t0 = performance.now()) {
    this.camera = camera;
    this.t0 = t0;
    this.columns = COLUMNS[camera];
    this.data = Object.fromEntries(this.columns.map(([c]) => [c, []]));
    this.events = [];
    this.next = -Infinity;
    this.n = 0;
  }

  // ms since the start of the run, on the performance.now() clock.
  rel(ts) {
    return Math.round(ts - this.t0);
  }

  now() {
    return this.rel(performance.now());
  }

  event(type, data = {}, ts = performance.now()) {
    const e = { t: this.rel(ts), type, ...data };
    this.events.push(e);
    return e;
  }

  // row: {t (abs ms), ph (phase name), ...columns}. Throttled to ≤ 30 Hz
  // (≤ 5 Hz outside the measured phases) without letting jitter halve the rate.
  sample(row) {
    const fast = row.ph === 'calibrate' || row.ph === 'countdown' || row.ph === 'hold';
    const period = fast ? FULL_PERIOD : SLOW_PERIOD;
    if (row.t < this.next - JITTER) return false;
    this.next = Math.max(this.next + period, row.t + period - JITTER);
    for (const [c, d] of this.columns) {
      let v = row[c];
      if (c === 't') v = this.rel(v);
      else if (c === 'ph') v = PHASES.indexOf(v);
      else if (c === 'iss') v = ISSUES.indexOf(v ?? null);
      this.data[c].push(round(v, d));
    }
    this.n += 1;
    return true;
  }

  toJSON() {
    return { n: this.n, cols: this.columns.map(([c]) => c), ...this.data };
  }
}

// gzip via CompressionStream where available (all current browsers); plain JSON otherwise.
export async function packJson(obj) {
  const text = JSON.stringify(obj);
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      const blob = await new Response(stream).blob();
      return { blob: new Blob([blob], { type: 'application/gzip' }), gz: true, bytes: text.length };
    } catch (err) {
      console.warn('gzip failed, saving plain JSON', err);
    }
  }
  return { blob: new Blob([text], { type: 'application/json' }), gz: false, bytes: text.length };
}
