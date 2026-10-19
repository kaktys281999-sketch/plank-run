// Body latency from "Качнись в такт" (plan §12.1; spec-rhythm §6.2).
//
// The user sways left on odd clicks and right on even ones (12 clicks, 40 BPM).
// The reference is a square wave that flips at every click: -1 (left) after
// odd clicks, +1 (right) after even ones. The lag that maximizes the normalized
// cross-correlation between this reference and the control signal x(t) is the
// delay from the click to the middle of the body's move AS THE APP SEES IT
// (human reaction + camera pipeline + inference + filter).
//
// Two more numbers help to read it:
//  - arrival: median time from a click until x has covered 80 % of the way to
//    the new side ("be in the lane on the beat", what a positional rhythm game
//    needs), with its MAD — spec-rhythm asks to retry when the spread > 120 ms;
//  - a sine reference with extremes on the clicks, to see whether the person
//    "arrived on the beat" instead of "moved on the beat".
// Pure functions: the browser runs them at the end of the run, and
// tools/field-report re-runs them on the saved samples.

const STEP = 10;             // ms, resampling grid
const MAX_GAP = 250;         // ms, longer holes in the signal are not interpolated
export const LAG_RANGE = [-300, 1200]; // ms; the pattern repeats every 3 s, so keep it under half of that

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (a) => {
  const m = median(a);
  return m === null ? null : median(a.map((v) => Math.abs(v - m)));
};
const quantile = (a, q) => {
  if (!a.length) return null;
  const s = [...a].sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};

// Linear interpolation of (t, v) at time `at`; null across holes > MAX_GAP.
function makeSampler(t, v) {
  let i = 0;
  return (at) => {
    if (at < t[0] || at > t[t.length - 1]) return null;
    if (at < t[i]) i = 0;
    while (i < t.length - 2 && t[i + 1] < at) i += 1;
    const t0 = t[i];
    const t1 = t[i + 1] ?? t0;
    if (t1 - t0 > MAX_GAP) return null;
    const v0 = v[i];
    const v1 = v[i + 1] ?? v0;
    if (v0 === null || v1 === null) return null;
    return t1 === t0 ? v0 : v0 + ((v1 - v0) * (at - t0)) / (t1 - t0);
  };
}

// side of click k (0-based): odd click in 1-based numbering = left = -1.
const sideOf = (k) => (k % 2 === 0 ? -1 : 1);

function squareRef(clicks, at) {
  if (at < clicks[0]) return null;
  let k = 0;
  while (k < clicks.length - 1 && clicks[k + 1] <= at) k += 1;
  // Hold the last side for one interval after the last click.
  const last = clicks.length - 1;
  if (k === last && at > clicks[last] + (clicks[last] - clicks[last - 1])) return null;
  return sideOf(k);
}

function sineRef(clicks, at) {
  if (at < clicks[0] || at > clicks[clicks.length - 1]) return null;
  let k = 0;
  while (k < clicks.length - 2 && clicks[k + 1] <= at) k += 1;
  const phase = (at - clicks[k]) / (clicks[k + 1] - clicks[k]);
  return sideOf(k) * Math.cos(Math.PI * phase);
}

function pearson(a, b) {
  const n = a.length;
  if (n < 10) return null;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

// Best lag of `sample` against `ref` over LAG_RANGE, refined with a parabola.
function bestLag(clicks, ref, sample, span) {
  const grid = [];
  for (let at = span[0]; at <= span[1]; at += STEP) {
    const r = ref(clicks, at);
    if (r !== null) grid.push([at, r]);
  }
  const curve = [];
  let best = null;
  for (let lag = LAG_RANGE[0]; lag <= LAG_RANGE[1]; lag += STEP) {
    const a = [];
    const b = [];
    for (const [at, r] of grid) {
      const v = sample(at + lag);
      if (v !== null) { a.push(r); b.push(v); }
    }
    const c = pearson(a, b);
    curve.push(c);
    if (c !== null && (!best || c > best.corr)) best = { lag, corr: c, coverage: grid.length ? a.length / grid.length : 0, idx: curve.length - 1 };
  }
  if (!best) return null;
  const [l, m, r] = [curve[best.idx - 1], curve[best.idx], curve[best.idx + 1]];
  let lag = best.lag;
  if (l != null && r != null && l - 2 * m + r !== 0) lag += (STEP * (l - r)) / (2 * (l - 2 * m + r));
  const edge = best.idx === 0 || best.idx === curve.length - 1;
  return { lagMs: Math.round(lag), corr: Math.round(best.corr * 1000) / 1000, coverage: Math.round(best.coverage * 100) / 100, edge };
}

// For each click after the first: time until x covers 80 % of the way from
// where it was to the side the click asks for.
function arrivals(clicks, t, x, sample) {
  const out = [];
  const interval = clicks[1] - clicks[0];
  const levels = x.filter((v) => v !== null);
  const hi = quantile(levels, 0.9);
  const lo = quantile(levels, 0.1);
  if (hi === null || hi - lo < 0.2) return out;
  for (let k = 1; k < clicks.length; k++) {
    const c = clicks[k];
    const target = sideOf(k) > 0 ? hi : lo;
    const from = sample(c);
    if (from === null) continue;
    const goal = from + 0.8 * (target - from);
    const dir = Math.sign(target - from);
    if (dir === 0 || Math.abs(target - from) < 0.25 * (hi - lo)) continue;
    for (let at = c + LAG_RANGE[0]; at <= c + interval; at += STEP) {
      const v = sample(at);
      if (v !== null && (v - goal) * dir >= 0 && at >= c - 300) {
        out.push(at - c);
        break;
      }
    }
  }
  return out;
}

// clicks: click times (ms) on the same clock as t; t: sample times (ms, ascending);
// x: control values (sign: + = user's right). Returns null when there is nothing to measure.
export function estimateLatency({ clicks, t, x }) {
  if (!clicks || clicks.length < 4 || !t || t.length < 20) return null;
  const sample = makeSampler(t, x);
  const span = [clicks[0], clicks[clicks.length - 1] + (clicks[1] - clicks[0])];
  const sq = bestLag(clicks, squareRef, sample, span);
  if (!sq) return null;
  const sine = bestLag(clicks, sineRef, sample, [clicks[0], clicks[clicks.length - 1]]);
  const inWindow = x.filter((v, i) => v !== null && t[i] >= span[0] && t[i] <= span[1]);
  const amp = inWindow.length ? quantile(inWindow, 0.95) - quantile(inWindow, 0.05) : 0;
  const arr = arrivals(clicks, t, x, sample);
  const result = {
    lagMs: sq.lagMs,
    corr: sq.corr,
    coverage: sq.coverage,
    amplitude: Math.round(amp * 100) / 100,
    arrivalMs: arr.length ? Math.round(median(arr)) : null,
    arrivalMadMs: arr.length ? Math.round(mad(arr)) : null,
    arrivals: arr.length,
    sine: sine && { lagMs: sine.lagMs, corr: sine.corr },
  };
  const reasons = [];
  if (sq.corr < 0.6) reasons.push('weak_correlation');
  if (sq.coverage < 0.7) reasons.push('gaps');
  if (amp < 0.8) reasons.push('small_sway');
  if (sq.edge) reasons.push('lag_at_edge');
  if (result.arrivalMadMs !== null && result.arrivalMadMs > 120) reasons.push('spread_over_120ms');
  result.confidence = reasons.length ? 'low' : 'ok';
  result.reasons = reasons;
  return result;
}

// Re-runs the estimate on a saved protocol file (browser at the end of a run,
// and tools/field-report). Uses hold-phase samples of the beat segment only.
export function latencyFromFile(file) {
  const seg = file.segments?.find((s) => file.scenario?.[s.i]?.beat);
  if (!seg) return null;
  const clicks = file.events.filter((e) => e.type === 'click' && e.seg === seg.i).map((e) => e.t);
  if (clicks.length < 4) return null;
  const S = file.samples;
  const hold = (file.codes?.phase ?? []).indexOf('hold');
  const t = [];
  const tCap = [];
  const x = [];
  const raw = [];
  for (let i = 0; i < S.n; i++) {
    if (S.seg[i] !== seg.i || S.ph[i] !== hold) continue;
    t.push(S.t[i]);
    tCap.push(S.t[i] - (S.cl?.[i] ?? 0));
    x.push(S.x[i]);
    // Raw, unfiltered face shift in the same direction as x (x = −dx / range).
    raw.push(S.dx?.[i] == null ? null : -S.dx[i]);
  }
  const app = estimateLatency({ clicks, t, x });
  if (!app) return { segment: seg.i, clicks: clicks.length, confidence: 'none', reasons: ['no_signal'] };
  const out = { segment: seg.i, clicks: clicks.length, ...app };
  // Same estimate on the frame-capture clock: removes camera → app delay.
  const hasCapture = S.cl && S.cl.some((v) => v);
  if (hasCapture) {
    const cap = estimateLatency({ clicks, t: tCap, x });
    out.captureLagMs = cap?.lagMs ?? null;
    const pipe = S.cl.filter((v, i) => v != null && S.seg[i] === seg.i && S.ph[i] === hold);
    out.pipelineMs = Math.round(median(pipe) ?? 0);
  }
  // On the unfiltered signal: the difference is the smoothing filter's lag.
  if (raw.some((v) => v !== null)) {
    const r = estimateLatency({ clicks, t, x: raw });
    out.rawLagMs = r?.lagMs ?? null;
  }
  return out;
}

export { median, quantile, mad };
