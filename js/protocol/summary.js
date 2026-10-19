// The numbers Stage 0 is judged by (plan §12.1 "Готово, когда"), computed from
// a protocol file. Pure: the page shows it at the end and stores it in the file;
// tools/field-report recomputes it from the raw samples and events.

import { median, quantile, latencyFromFile } from './latency.js';

export const SUMMARY_VERSION = 1;

const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

// Hold-phase sample indices of one segment.
function holdRows(file, segIndex) {
  const S = file.samples;
  const hold = file.codes.phase.indexOf('hold');
  const rows = [];
  for (let i = 0; i < S.n; i++) if (S.seg[i] === segIndex && S.ph[i] === hold) rows.push(i);
  return rows;
}

function range(values) {
  const v = values.filter((x) => x !== null && x !== undefined);
  if (!v.length) return { min: null, max: null, p05: null, p95: null };
  return { min: Math.min(...v), max: Math.max(...v), p05: quantile(v, 0.05), p95: quantile(v, 0.95) };
}

export function segmentStats(file) {
  const S = file.samples;
  return file.segments.map((seg) => {
    const def = file.scenario[seg.i] ?? {};
    const rows = holdRows(file, seg.i);
    const pauses = file.pauses.filter((p) => p.seg === seg.i);
    const x = range(rows.map((i) => S.x[i]));
    const y = range(rows.map((i) => S.y[i]));
    const span = rows.length > 1 ? S.t[rows[rows.length - 1]] - S.t[rows[0]] : 0;
    return {
      i: seg.i,
      id: seg.id,
      status: seg.status,
      variant: seg.variant,
      heldMs: seg.heldMs,
      steady: !!def.steady,
      pauses: pauses.filter((p) => !p.expected).length,
      expectedPauses: pauses.filter((p) => p.expected).length,
      falsePauses: pauses.filter((p) => p.falsePause).length,
      okPct: rows.length ? Math.round((100 * rows.filter((i) => S.ok[i] === 1).length) / rows.length) : null,
      x: { min: r2(x.min), max: r2(x.max) },
      y: { min: r2(y.min), max: r2(y.max) },
      // Spread without the tails (a nod should barely move the control).
      xSpread: x.p95 === null ? null : r2(x.p95 - x.p05),
      ySpread: y.p95 === null ? null : r2(y.p95 - y.p05),
      fps: span > 0 ? r1(((rows.length - 1) * 1000) / span) : null,
      ...(seg.standDetectMs !== undefined && { standDetectMs: seg.standDetectMs }),
    };
  });
}

export function computeSummary(file) {
  const segs = file.segments ?? [];
  const S = file.samples;

  // ---- calibration: attempts in order across segments ----
  const attempts = segs.flatMap((s) => (s.calib ?? []).map((c) => ({ ...c, seg: s.i })));
  const firstOk = attempts.findIndex((a) => a.ok);
  const successes = attempts.filter((a) => a.ok).map((a) => a.ms);
  const calibration = {
    attempts: attempts.length,
    failures: attempts.filter((a) => !a.ok && !a.aborted).length,
    // Time until the FIRST success, failed attempts included: what a newcomer lives through.
    firstMs: firstOk < 0 ? null : attempts.slice(0, firstOk + 1).reduce((a, c) => a + c.ms, 0),
    firstAttempts: firstOk < 0 ? null : firstOk + 1,
    medianMs: successes.length ? Math.round(median(successes)) : null,
    never: firstOk < 0,
    // Plan: "≤ 1 из 8 дважды не откалибровался".
    failedTwice: firstOk < 0 ? attempts.filter((a) => !a.ok && !a.aborted).length >= 2 : attempts.slice(0, firstOk).filter((a) => !a.aborted).length >= 2,
  };

  // ---- pauses on the steady ("ровные") segments ----
  const steady = new Set(segs.filter((s) => file.scenario[s.i]?.steady).map((s) => s.i));
  const steadyMs = segs.filter((s) => steady.has(s.i)).reduce((a, s) => a + (s.heldMs ?? 0), 0);
  const onSteady = file.pauses.filter((p) => steady.has(p.seg) && !p.expected);
  const minutes = steadyMs / 60000;
  const pauses = {
    total: file.pauses.length,
    expected: file.pauses.filter((p) => p.expected).length,
    labelledFalse: file.pauses.filter((p) => p.falsePause).length,
    steadyMs,
    steadyPauses: onSteady.length,
    steadyFalse: onSteady.filter((p) => p.falsePause).length,
    // Labelled by the user: the plan's criterion. Unlabelled = every unexpected pause (upper bound).
    falsePerMin: minutes > 0 ? r2(onSteady.filter((p) => p.falsePause).length / minutes) : null,
    allPerMin: minutes > 0 ? r2(onSteady.length / minutes) : null,
  };

  // ---- steering range: the segments that ask for full deflection ----
  const axis = file.meta.camera === 'side' ? 'y' : 'x';
  const steerSegs = segs.filter((s) => file.scenario[s.i]?.steer);
  const steerVals = steerSegs.flatMap((s) => holdRows(file, s.i).map((i) => S[axis][i])).filter((v) => v !== null);
  const maxPos = steerVals.length ? Math.max(...steerVals) : null;
  const maxNeg = steerVals.length ? -Math.min(...steerVals) : null;
  const steering = {
    axis,
    maxPos: r2(maxPos),
    maxNeg: r2(maxNeg),
    maxAbs: steerVals.length ? r2(Math.max(maxPos, maxNeg)) : null,
    // Both directions reached full deflection (±1 ≈ 7 cm, plan §6.4).
    reachedBoth: steerVals.length ? Math.min(maxPos, maxNeg) >= 1 : false,
  };

  const perSegment = segmentStats(file);
  const nod = perSegment.find((s) => s.id === 'nod');
  const stand = perSegment.find((s) => s.id === 'stand');

  // ---- latency ----
  const lat = file.latency ?? latencyFromFile(file);
  const latency = lat && lat.lagMs !== undefined
    ? { ms: lat.lagMs, method: lat.method, corr: lat.corr, arrivalMs: lat.arrivalMs, captureLagMs: lat.captureLagMs ?? null, rawLagMs: lat.rawLagMs ?? null, confidence: lat.confidence, reasons: lat.reasons }
    : { ms: null, confidence: 'none', reasons: lat?.reasons ?? ['not_measured'] };

  // ---- device performance ----
  const ms = S.ms.filter((v, i) => v !== null && S.ph[i] === file.codes.phase.indexOf('hold'));
  const holdFps = perSegment.map((s) => s.fps).filter((v) => v !== null);
  const perf = {
    delegate: file.device?.delegate ?? null,
    model: file.device?.model ?? null,
    inferenceP50: r1(quantile(ms, 0.5) ?? file.device?.check?.inferenceP50),
    inferenceP95: r1(quantile(ms, 0.95) ?? file.device?.check?.inferenceP95),
    fps: r1(holdFps.length ? median(holdFps) : file.device?.check?.fps),
    checkFps: file.device?.check?.fps ?? null,
    loadMs: file.device?.load?.totalMs ?? null,
    pageLoadMs: file.device?.page?.loadMs ?? null,
  };

  const answers = {
    neck: file.health?.neck ?? null,
    amplitude: file.feedback?.amplitude ?? null,
    falsePauses: file.feedback?.falsePauses ?? null,
    fun: file.feedback?.fun ?? null,
    loadSpeed: file.feedback?.loadSpeed ?? null,
  };

  const neckOk = answers.neck === null ? null : answers.neck >= 3;
  const criteria = {
    calibrated: !calibration.never,
    calibNotFailedTwice: !calibration.failedTwice,
    calibUnder30s: calibration.firstMs !== null && calibration.firstMs <= 30000,
    falsePausesOk: pauses.falsePerMin === null ? null : pauses.falsePerMin <= 1,
    steerFull: steering.reachedBoth,
    neckOk,
    steerNoNeckComplaint: steering.reachedBoth && neckOk === true,
    wantsMore: answers.fun === null ? null : answers.fun >= 4,
    latencyMeasured: latency.confidence === 'ok',
  };

  return {
    v: SUMMARY_VERSION,
    complete: file.meta.ended === 'complete',
    segments: {
      planned: file.scenario.length,
      done: segs.filter((s) => s.status === 'done').length,
      skipped: segs.filter((s) => s.status === 'skipped').length,
      autoStopped: segs.filter((s) => s.status === 'auto_stop').length,
      calibFailed: segs.filter((s) => s.status === 'calib_fail').length,
      knees: segs.filter((s) => s.variant === 'knees').length,
    },
    calibration,
    pauses,
    steering,
    nod: nod ? { xSpread: nod.xSpread, ySpread: nod.ySpread } : null,
    standDetectMs: stand?.standDetectMs ?? null,
    latency,
    perf,
    answers,
    criteria,
    perSegment,
  };
}
