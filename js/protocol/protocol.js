// ?protocol — the Stage 0 field test ("Живая проверка", plan §12.1).
//
// A friend opens the link, agrees to the recording, passes the v0.1.1 safety
// questions, checks the device, and then the phone runs a ~6–8 minute script
// of short holds (each ≤ 20 s) by voice. Afterwards they label the automatic
// pauses, answer 5 questions and send ONE file to the owner themselves.
// Nothing is uploaded anywhere: the file is built on the device and handed to
// the share sheet or downloaded.
//
// Flow: consent → safety gate (main.js) → setup → device check → run → feedback → done.
// The run is plain async code (one await per phase) on top of two loops:
//  - the camera-frame callback: detection, analysis, pauses, recording;
//  - requestAnimationFrame: drawing the screen.

import { VisionTracker, startCamera, stopCamera, onEveryVideoFrame } from '../pose.js';
import { PlankAnalyzer, ISSUE_TEXT, THRESHOLDS } from '../plank.js';
import { Sound } from '../audio.js';
import { VoicePlayer } from '../voice.js';
import { drawFace, drawSkeleton, clearCanvas } from '../draw.js';
import { buildScenario, describeScenario, beatTimes, PROTOCOL_VERSION } from './scenario.js';
import { Recorder, PHASES, ISSUES, packJson } from './recorder.js';
import { latencyFromFile, quantile } from './latency.js';
import { computeSummary } from './summary.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);

// ?protocol&fast[=k] scales every duration by k (default 0.25) — for tests only.
// The beat stays at 40 BPM: it is the measurement itself.
const SCALE = params.has('fast') ? Number(params.get('fast')) || 0.25 : 1;
const S = (sec) => sec * 1000 * SCALE;
const MODEL = params.has('full') ? 'full' : 'lite';
const APP_VERSION = '0.1.1';
const CONSENT_VERSION = 1;

const CALIB_TIMEOUT = Math.max(S(20), 15000); // per attempt; then rest and one more try
const CALIB_ATTEMPTS = 2;
const PAUSE_STOP_MS = 4000;      // same as the game: a longer break ends the hold (plan §6.5 autostop)
const EXPECTED_STOP_MS = 6000;   // scripted sag/pike pauses get a little longer
const MAX_IN_POSITION = 30000;   // guard: calibration stillness + 3-2-1 + hold never above this
const CHECK_MS = SCALE < 1 ? 2000 : 3000;

// What the user sees for each automatic pause (feed after the run).
const PAUSE_TEXT = { ...ISSUE_TEXT, lost: 'Не видно в кадре', noFace: 'Не видно лица' };

const sound = new Sound();
const voice = new VoicePlayer(sound, { voice: params.get('voice') });
const tracker = new VisionTracker();
const video = $('#p-video');
const overlay = $('#p-overlay');
const cam = $('#p-cam');

let api = null; // {safetyOk, showSafety, safetyRoute, showScreen} from main.js
let stopFrames = null;
let wakeLock = null;

const st = {
  step: null,
  pseudonym: '',
  consentAt: null,
  camera: 'front',
  backPain: null,
  scenario: [],
  rec: null,
  createdAt: Date.now(),
  runStart: 0,
  device: {},
  perf: { ms: [], frames: 0, first: 0, last: 0 },
  frameClock: null,
  // run
  analyzer: null,
  pose: null,
  calibProgress: 0,
  phase: 'check',
  phaseStart: 0,
  phaseDur: 0,
  note: '',
  seg: null,
  segIndex: -1,
  kneel: false,
  ctl: { skip: false, stop: false, kneel: false },
  inPositionSince: 0,
  pause: null,
  pauseCount: 0,
  pauses: [],
  cueWindows: [],
  beat: null,
  segments: [],
  ended: null,
  latency: null,
  // result
  file: null,
  packed: null,
  filename: '',
  sent: false,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v, d = 0) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const secText = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} с`);
const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------- steps ----------------

function showStep(name) {
  st.step = name;
  for (const el of document.querySelectorAll('#protocol .p-step')) el.hidden = el.id !== `p-${name}`;
  $('#protocol').dataset.step = name;
  api.showScreen('protocol');
  cam.dataset.size = name === 'check' ? 'inline' : name === 'run' ? 'small' : 'off';
}

export function initProtocol(mainApi) {
  api = mainApi;
  api.safetyRoute.pass = () => showStep('setup');
  api.safetyRoute.back = () => showStep('consent');
  bindConsent();
  bindSetup();
  bindCheck();
  bindRun();
  bindFeedback();
  bindDone();
  showStep('consent');
  document.title = 'Plank Run — проверка';
  window.addEventListener('beforeunload', (e) => {
    // Losing the run by an accidental reload would waste the friend's 8 minutes.
    if (['run', 'feedback'].includes(st.step) || (st.step === 'done' && !st.sent)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!st.rec || !['check', 'run'].includes(st.step)) return;
    st.rec.event(document.visibilityState === 'visible' ? 'visible' : 'hidden', { seg: st.segIndex });
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}

// ---------------- consent ----------------

// Letters, digits, space, dot, dash, underscore; ≤ 24 characters.
const cleanPseudonym = (s) => s.normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);

function bindConsent() {
  const name = $('#p-pseudonym');
  const agree = $('#p-agree');
  const next = $('#p-consent-next');
  const update = () => { next.disabled = !(cleanPseudonym(name.value) && agree.checked); };
  name.addEventListener('input', update);
  agree.addEventListener('change', update);
  next.addEventListener('click', () => {
    st.pseudonym = cleanPseudonym(name.value);
    st.consentAt = new Date().toISOString();
    // The same v0.1.1 gate as the game: questions once, only the outcome is stored.
    if (api.safetyOk()) showStep('setup');
    else api.showSafety();
  });
}

// ---------------- setup ----------------

function bindSetup() {
  const next = $('#p-setup-next');
  const update = () => {
    st.camera = document.querySelector('input[name="p-camera"]:checked')?.value ?? 'front';
    const side = st.camera === 'side';
    $('#p-back-field').hidden = !side;
    const back = document.querySelector('input[name="p-back"]:checked')?.value;
    st.backPain = side ? (back ? back === 'yes' : null) : null;
    next.disabled = side && st.backPain === null;
  };
  $('#p-setup').addEventListener('change', update);
  update();
  next.addEventListener('click', () => {
    // User gesture: unlock audio and speech now (iOS), start fetching voice clips.
    sound.unlock();
    sound.prime();
    voice.load();
    deviceCheck();
  });
}

// ---------------- device check ----------------

const CHECK_ROWS = [
  ['camera', 'Камера'],
  ['model', 'Модель'],
  ['speed', 'Скорость'],
  ['wake', 'Экран не гаснет'],
  ['audio', 'Звук'],
  ['voice', 'Голос'],
  ['device', 'Устройство'],
];

function setRow(key, state, text) {
  const li = $(`#p-checks li[data-key="${key}"]`);
  li.dataset.state = state;
  li.querySelector('span').textContent = text;
}

function bindCheck() {
  $('#p-check-retry').addEventListener('click', () => {
    stopEverything();
    deviceCheck();
  });
  $('#p-check-start').addEventListener('click', () => {
    // Second user gesture: resume audio, prime speech, go fullscreen.
    sound.unlock();
    sound.prime();
    document.documentElement.requestFullscreen?.().catch(() => {});
    requestWakeLock();
    runScript();
  });
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return 'unsupported';
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    return 'granted';
  } catch {
    wakeLock = null;
    return 'denied';
  }
}

async function deviceInfo() {
  const nav = navigator;
  const info = {
    ua: nav.userAgent,
    platform: nav.userAgentData?.platform ?? nav.platform ?? null,
    mobile: nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/.test(nav.userAgent),
    screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, orientation: screen.orientation?.type ?? null },
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    connection: nav.connection ? { type: nav.connection.effectiveType ?? null, downlinkMbps: nav.connection.downlink ?? null } : null,
  };
  // Chrome hides the phone model in the UA string; "≥ 5 телефонов" needs it.
  try {
    const he = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (he) {
      info.model = he.model || null;
      info.platformVersion = he.platformVersion || null;
    }
  } catch { /* not available */ }
  const navEntry = performance.getEntriesByType?.('navigation')?.[0];
  if (navEntry) {
    info.page = {
      dclMs: round(navEntry.domContentLoadedEventEnd),
      loadMs: round(navEntry.loadEventEnd || navEntry.domContentLoadedEventEnd),
      transferKb: round((navEntry.transferSize ?? 0) / 1024),
    };
  }
  return info;
}

function deviceLabel(info) {
  const ua = info.ua;
  if (/iPhone/.test(ua)) return `iPhone, iOS ${(ua.match(/OS (\d+[_\d]*)/)?.[1] ?? '?').replace(/_/g, '.')}`;
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return `${info.model || 'Android'}, Android ${ua.match(/Android (\d+)/)?.[1] ?? '?'}`;
  return `${info.platform ?? 'компьютер'}`;
}

async function deviceCheck() {
  showStep('check');
  $('#p-check-start').disabled = true;
  $('#p-check-retry').hidden = true;
  $('#p-check-error').hidden = true;
  $('#p-checks').innerHTML = CHECK_ROWS.map(([key, label]) => `<li data-key="${key}" data-state="wait"><b>${label}</b><span>…</span></li>`).join('');

  st.rec = new Recorder(st.camera);
  st.rec.event('check_start', { camera: st.camera });
  st.phase = 'check';
  st.segIndex = -1;
  st.perf = { ms: [], frames: 0, first: 0, last: 0 };
  const fail = (key, err) => {
    setRow(key, 'bad', err.message ?? String(err));
    $('#p-check-error').textContent = `${err.message ?? err} Проверь разрешения и нажми «Повторить».`;
    $('#p-check-error').hidden = false;
    $('#p-check-retry').hidden = false;
    st.rec.event('check_fail', { what: key, error: String(err.message ?? err).slice(0, 200) });
  };

  // Camera
  setRow('camera', 'wait', 'Включаю камеру…');
  try {
    await startCamera(video);
  } catch (err) {
    fail('camera', err);
    return;
  }
  const track = video.srcObject?.getVideoTracks?.()[0];
  const ts = track?.getSettings?.() ?? {};
  st.device.camera = { ok: true, w: video.videoWidth, h: video.videoHeight, fps: round(ts.frameRate, 1) };
  setRow('camera', 'ok', `${video.videoWidth}×${video.videoHeight}${ts.frameRate ? `, ${Math.round(ts.frameRate)} к/с` : ''}`);

  // MediaPipe + model: this is the "load speed" friends feel.
  const kind = st.camera === 'side' ? 'pose' : 'face';
  setRow('model', 'wait', 'Загружаю MediaPipe…');
  const t1 = performance.now();
  let tModel = null;
  try {
    await tracker.init(kind, MODEL, (msg) => {
      if (!/MediaPipe/.test(msg) && tModel === null) tModel = performance.now();
      setRow('model', 'wait', msg);
    });
  } catch (err) {
    fail('model', err);
    return;
  }
  const t2 = performance.now();
  tModel ??= t1;
  st.device.load = { mediapipeMs: round(tModel - t1), modelMs: round(t2 - tModel), totalMs: round(t2 - t1), source: tracker.source?.name ?? null };
  st.device.delegate = tracker.delegate;
  st.device.model = kind === 'face' ? 'blaze_face_short_range' : `pose_landmarker_${MODEL}`;
  setRow('model', 'ok', `${kind === 'face' ? 'лицо (BlazeFace)' : `поза (${MODEL})`} · ${tracker.delegate} · загрузка ${secText(t2 - t1)}`);

  // Frames: inference time and vision fps on this device.
  newAnalyzer(null);
  stopFrames = onEveryVideoFrame(video, onFrame);
  setRow('speed', 'wait', 'Меряю…');
  st.perf = { ms: [], frames: 0, first: 0, last: 0 };
  await sleep(CHECK_MS);
  const check = perfStats(st.perf);
  st.device.check = check;
  const slow = check.fps < 12 || (check.inferenceP95 ?? 0) > 80;
  setRow('speed', slow ? 'warn' : 'ok', `${check.fps} к/с · инференс ${check.inferenceP50}/${check.inferenceP95} мс (p50/p95)${slow ? ' — медленно, но можно' : ''}`);

  const wake = await requestWakeLock();
  st.device.wakeLock = wake;
  setRow('wake', wake === 'granted' ? 'ok' : 'warn', wake === 'granted' ? 'да (Wake Lock)' : wake === 'denied' ? 'не разрешено — коснись экрана, если погаснет' : 'не поддерживается — коснись экрана, если погаснет');

  st.device.audio = sound.ctx?.state ?? 'none';
  setRow('audio', st.device.audio === 'running' ? 'ok' : 'warn', st.device.audio === 'running' ? 'включён' : `не разблокирован (${st.device.audio})`);

  const vs = await voice.load();
  st.device.voice = { manifest: vs.manifest, voice: vs.voice, codec: vs.codec ?? null, clips: vs.loaded, lines: vs.lines, loadMs: vs.loadMs, speech: 'speechSynthesis' in window, ruSpeech: !!voice.ruVoice };
  const voiceOk = vs.loaded === vs.lines;
  const system = `голос системы${voice.ruVoice ? ' (русский)' : ' — русского голоса нет, следи за экраном'}`;
  setRow('voice', voiceOk ? 'ok' : 'warn', voiceOk
    ? `записанный голос, ${vs.loaded} фраз`
    : vs.loaded ? `записано ${vs.loaded} из ${vs.lines}, остальное — голос системы`
      : vs.manifest && vs.codec === false ? `браузер не играет .m4a — ${system}` : system);

  Object.assign(st.device, await deviceInfo());
  st.device.frameClock = st.frameClock;
  setRow('device', 'ok', `${deviceLabel(st.device)} · экран ${st.device.screen.w}×${st.device.screen.h}`);
  st.rec.event('check_end', { fps: check.fps, p50: check.inferenceP50, p95: check.inferenceP95 });

  st.scenario = buildScenario(st.camera, { backPain: st.backPain === true });
  $('#p-check-hint').textContent = `Дальше ${st.scenario.length} коротких отрезков, около ${Math.round(estimateMinutes())} минут. Встань так, чтобы видеть экран с пола.`;
  $('#p-check-start').disabled = false;
}

function estimateMinutes() {
  const s = st.scenario.reduce((a, seg) => a + seg.hold + seg.rest + 10, 20);
  return s / 60;
}

function perfStats(p) {
  const span = p.last - p.first;
  return {
    frames: p.frames,
    fps: span > 0 ? round(((p.frames - 1) * 1000) / span, 1) : 0,
    inferenceP50: round(quantile(p.ms, 0.5), 1),
    inferenceP95: round(quantile(p.ms, 0.95), 1),
  };
}

// ---------------- per-frame work ----------------

function newAnalyzer(seg) {
  const kneePlank = st.camera === 'side' && (st.kneel || !!seg?.knees);
  st.analyzer = new PlankAnalyzer({ camera: st.camera, kneePlank, sensitivity: 1 });
  st.calibProgress = 0;
}

function onFrame(now, meta) {
  const det = tracker.detect(video);
  if (det === null) return;
  const p = st.perf;
  if (!p.frames) p.first = now;
  p.frames += 1;
  p.last = now;
  if (p.ms.length < 30000) p.ms.push(det.ms);

  // Frame time for latency: when the camera captured it, if the browser says so.
  const frameTs = meta?.captureTime ?? meta?.presentationTime ?? null;
  st.frameClock ??= meta?.captureTime ? 'captureTime' : meta?.presentationTime ? 'presentationTime' : 'callback';

  const a = st.analyzer;
  if (!a) return;
  const t = now / 1000;
  const pose = a.update(det, video.videoWidth, video.videoHeight, t);
  st.pose = pose;
  if (st.phase === 'calibrate' && !a.calibrated) st.calibProgress = a.calibrate(pose, t);
  trackPause(pose, now);
  record(pose, det, now, frameTs);

  const color = pose.formOk ? '#5ef2c2' : pose.ready ? '#ffb547' : '#ff5d7a';
  if (tracker.kind === 'face') drawFace(overlay, video, det.face, color);
  else drawSkeleton(overlay, video, det.landmarks, color);
}

function record(pose, det, now, frameTs) {
  const a = st.analyzer;
  const b = a.baseline;
  const f = pose.f;
  const row = {
    t: now,
    seg: st.segIndex,
    ph: st.phase,
    pr: pose.present,
    ok: pose.formOk,
    iss: pose.rawIssue,
    x: pose.control.x,
    y: pose.control.y,
    ms: det.ms,
    cl: frameTs ? now - frameTs : null,
  };
  if (f && st.camera === 'front') {
    row.ff = f.faceFrac;
    row.fsc = f.score;
    if (b) {
      // Relative to the calibrated face, in face widths: no absolute positions.
      row.dx = (f.cx - b.cx) / b.fs;
      row.dy = (f.cy - b.cy) / b.fs;
      row.sc = f.fs / b.fs;
    }
  } else if (f) {
    row.ang = f.bodyAngle;
    row.hip = f.hipDev;
    row.dev = b ? a.hipDeviation(f) : null;
    row.knee = f.kneeDev;
    row.fb = f.fb;
    row.vis = f.visibility;
  }
  st.rec.sample(row);
}

// An automatic pause = the analyzer's debounced formOk drops during a hold,
// exactly what pauses the real game.
function trackPause(pose, now) {
  if (st.phase !== 'hold') return;
  if (!pose.formOk && !st.pause) {
    const reason = pose.issue ?? pose.rawIssue ?? 'lost';
    // Inside a scripted window (sag, pike, "stand up") the pause is the expected outcome.
    const cue = st.cueWindows.find((w) => now >= w.from && now <= w.to && (w.expect === 'any' || w.expect.includes(reason)));
    st.pause = { n: st.pauseCount++, seg: st.segIndex, start: now, reason, expected: !!cue };
    st.rec.event('pause_start', { seg: st.segIndex, n: st.pause.n, reason, expected: !!cue }, now);
    sound.warn();
  } else if (pose.formOk && st.pause) {
    closePause(now);
  }
}

function closePause(now, cut = false) {
  const p = st.pause;
  if (!p) return;
  st.pause = null;
  const ms = Math.round(now - p.start);
  st.pauses.push({ n: p.n, seg: p.seg, start: st.rec.rel(p.start), end: st.rec.rel(now), ms, reason: p.reason, expected: p.expected, ...(cut && { cut: true }), falsePause: false });
  st.rec.event('pause_end', { seg: p.seg, n: p.n, ms, ...(cut && { cut: true }) }, now);
}

// ---------------- the script ----------------

function setPhase(phase, durMs = 0, note = '') {
  st.phase = phase;
  st.phaseStart = performance.now();
  st.phaseDur = durMs;
  st.note = note;
}

// Resolves with 'stop' | 'skip' | 'kneel' (if listening) | 'timeout' | check()'s truthy value.
function waitFor(check, timeoutMs, { kneel = false } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      let r = null;
      if (st.ctl.stop) r = 'stop';
      else if (st.ctl.skip) r = 'skip';
      else if (kneel && st.ctl.kneel) r = 'kneel';
      else {
        const v = check?.();
        if (v) r = v === true ? 'until' : v;
        else if (performance.now() - start >= timeoutMs) r = 'timeout';
      }
      if (r) {
        clearInterval(id);
        resolve(r);
      }
    };
    const id = setInterval(tick, 25);
    tick();
  });
}

// Plays a line and waits for it (at most maxMs, scaled in fast mode); skip/stop cut it short.
async function say(id, maxMs = 6000, opts = {}) {
  st.rec.event('voice', { line: id, seg: st.segIndex });
  const limit = SCALE < 1 ? Math.min(maxMs, 1200) : maxMs;
  await Promise.race([voice.play(id, { priority: 2, ...opts }), waitFor(null, limit)]);
}

async function runScript() {
  showStep('run');
  st.runStart = performance.now();
  st.createdAt = Date.now();
  st.rec.event('run_start', { segments: st.scenario.map((s) => s.id) });
  st.ctl = { skip: false, stop: false, kneel: false };
  requestAnimationFrame(render);
  setPhase('intro');
  await say('p_welcome', 9000);
  if (!st.ctl.stop) await say('p_stop_pain', 4000);
  st.ctl.skip = false;

  for (let i = 0; i < st.scenario.length && !st.ctl.stop; i++) {
    await runSegment(i);
    const seg = st.scenario[i];
    if (!st.ctl.stop && i < st.scenario.length - 1 && seg.rest) await rest(seg.rest, st.scenario[i + 1]);
  }
  for (let i = st.segments.length; i < st.scenario.length; i++) {
    st.segments.push({ i, id: st.scenario[i].id, status: 'not_reached', variant: null, heldMs: 0, calib: [] });
  }
  st.ended = st.ctl.stop ? 'stopped' : 'complete';
  setPhase('end');
  st.rec.event('run_end', { ended: st.ended });
  if (st.ended === 'complete') await say('p_done', 5000);
  else voice.stop();
  finishRun();
}

function kneeVariant(seg) {
  return st.kneel || seg.knees ? 'knees' : 'toes';
}

async function runSegment(i) {
  const seg = st.scenario[i];
  const rec = { i, id: seg.id, status: 'running', variant: kneeVariant(seg), heldMs: 0, calib: [] };
  st.segments.push(rec);
  st.seg = seg;
  st.segIndex = i;
  st.ctl.skip = false;
  st.ctl.kneel = false;
  st.rec.event('segment_start', { seg: i, id: seg.id, variant: rec.variant });

  setPhase('intro');
  const introStart = performance.now();
  if (i > 0) await say('p_next', 3000);
  if (!st.ctl.skip && !st.ctl.stop) await say(seg.line, 6000);
  if (seg.warn && !st.ctl.skip && !st.ctl.stop) await say(seg.warn, 4000);
  // Time to read the title and hint (and to tap "Пропустить") even if the voice is silent.
  await waitFor(null, Math.max(0, S(4) - (performance.now() - introStart)));

  // The beat is never scaled: 12 clicks at 40 BPM are the measurement.
  let remaining = seg.beat ? seg.hold * 1000 : S(seg.hold);
  let counted = false;
  for (;;) {
    if (st.ctl.stop) return endSegment(rec, 'stopped');
    if (st.ctl.skip) return endSegment(rec, 'skipped', { by: 'button', phase: st.phase });
    const c = await calibrate(seg, rec);
    if (c === 'fail') return endSegment(rec, 'calib_fail');
    if (c !== 'ok') continue; // skip / stop: handled at the top
    if (!counted) {
      const cd = await countdown();
      if (cd === 'kneel') { st.ctl.kneel = false; continue; }
      if (cd !== 'timeout') continue;
      counted = true;
    }
    const h = await hold(seg, rec, remaining);
    rec.heldMs += h.heldMs;
    remaining -= h.heldMs;
    if (h.result === 'kneel') {
      st.ctl.kneel = false;
      // Recalibrate in the new position and finish the remaining time: the segment total stays ≤ its hold.
      if (remaining > S(3)) continue;
      return endSegment(rec, 'done');
    }
    if (h.result === 'skip') return endSegment(rec, 'skipped', { by: 'button', phase: 'hold' });
    if (h.result === 'stop') return endSegment(rec, 'stopped');
    return endSegment(rec, h.result === 'auto_stop' ? 'auto_stop' : 'done', h.result === 'auto_stop' ? { reason: h.reason } : {});
  }
}

function endSegment(rec, status, extra = {}) {
  rec.status = status;
  if (extra.reason) rec.stopReason = extra.reason;
  st.rec.event('segment_end', { seg: rec.i, status, heldMs: rec.heldMs, variant: rec.variant, ...extra });
  if (status === 'skipped') st.rec.event('skip', { seg: rec.i, ...extra });
  st.ctl.skip = false;
}

function baselineNumbers(b) {
  if (!b) return null;
  return st.camera === 'front'
    ? { ff: round(b.faceFrac, 4), fsc: round(b.score, 2) }
    : { ang: round(b.bodyAngle, 1), hip: round(b.hipDev, 4), knee: round(b.kneeDev, 4), fb: round(b.fb, 4), vis: round(b.visibility, 2) };
}

async function calibrate(seg, rec) {
  for (let attempt = 1; attempt <= CALIB_ATTEMPTS;) {
    st.ctl.kneel = false;
    newAnalyzer(seg);
    rec.variant = kneeVariant(seg);
    setPhase('calibrate', CALIB_TIMEOUT);
    const start = performance.now();
    st.rec.event('calib_start', { seg: rec.i, attempt, variant: rec.variant });
    if (attempt > 1) say('p_hold_still', 4000);
    const r = await waitFor(() => st.analyzer.calibrated, CALIB_TIMEOUT, { kneel: true });
    const ms = Math.round(performance.now() - start);
    if (r === 'until') {
      rec.calib.push({ attempt, ok: true, ms });
      st.rec.event('calib_end', { seg: rec.i, attempt, ok: true, ms, baseline: baselineNumbers(st.analyzer.baseline) });
      // The still streak that produced the baseline started here: the user is in position since then.
      st.inPositionSince = (st.analyzer.calibSince ?? performance.now() / 1000) * 1000;
      return 'ok';
    }
    if (r === 'kneel' || r === 'skip' || r === 'stop') {
      rec.calib.push({ attempt, ok: false, aborted: r, ms });
      st.rec.event('calib_end', { seg: rec.i, attempt, ok: false, aborted: r, ms });
      if (r === 'kneel') continue; // same attempt, new position
      return r;
    }
    rec.calib.push({ attempt, ok: false, ms, lastIssue: st.pose?.rawIssue ?? null });
    st.rec.event('calib_end', { seg: rec.i, attempt, ok: false, ms, reason: 'timeout', lastIssue: st.pose?.rawIssue ?? null });
    attempt += 1;
    if (attempt <= CALIB_ATTEMPTS) {
      // The user may have been holding a plank all along: rest before the second try.
      sound.warn();
      say('p_rest', 3000);
      setPhase('rest', S(8), 'calib');
      const w = await waitFor(null, S(8));
      if (w === 'stop') return 'stop';
      if (w === 'skip') return 'skip';
    }
  }
  return 'fail';
}

async function countdown() {
  setPhase('countdown', S(3));
  st.rec.event('countdown', { seg: st.segIndex });
  voice.play('p_three_two_one', { priority: 2 });
  return waitFor(null, S(3), { kneel: true });
}

// Click scheduling: perf-clock ms ↔ AudioContext seconds. getOutputTimestamp()
// pairs the audio clock with performance.now() at the moment a sample leaves
// the speaker, so it already includes output latency; otherwise currentTime is
// "now" and outputLatency/baseLatency is added by hand.
function audioClock(ctx) {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
    return { method: 'outputTimestamp', ctx0: ts.contextTime, perf0: ts.performanceTime };
  }
  const lat = ctx.outputLatency || ctx.baseLatency || 0;
  return { method: 'currentTime', ctx0: ctx.currentTime, perf0: performance.now() + lat * 1000 };
}

function scheduleBeat(beat, holdStart) {
  const ctx = sound.ctx;
  const times = beatTimes(beat);
  const oscs = [];
  const clock = ctx ? audioClock(ctx) : null;
  st.rec.event('beat', {
    seg: st.segIndex,
    clicks: times.length,
    bpm: beat.bpm,
    clock: clock?.method ?? 'none',
    audio: ctx?.state ?? 'none',
    outputLatencyMs: ctx?.outputLatency ? round(ctx.outputLatency * 1000, 1) : null,
    baseLatencyMs: ctx?.baseLatency ? round(ctx.baseLatency * 1000, 1) : null,
  });
  const heard = [];
  times.forEach((sec, k) => {
    const wanted = holdStart + sec * 1000; // perf ms when the click should be heard
    let at = wanted;
    if (ctx && clock) {
      const when = Math.max(ctx.currentTime + 0.02, clock.ctx0 + (wanted - clock.perf0) / 1000);
      // Left (odd) clicks lower, right (even) higher: easier to keep track of the side.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = k % 2 === 0 ? 880 : 1320;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.25, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
      osc.connect(g).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.08);
      oscs.push(osc);
      at = clock.perf0 + (when - clock.ctx0) * 1000;
    }
    heard.push(at);
    // Logged now with the (future) time it is heard; events are sorted on export.
    st.rec.event('click', { seg: st.segIndex, k: k + 1, side: k % 2 === 0 ? 'L' : 'R' }, at);
  });
  return {
    heard,
    stop() {
      for (const o of oscs) {
        try { o.stop(); } catch { /* already done */ }
      }
      // Clicks that will now never sound must not feed the latency estimate.
      const now = st.rec.now();
      st.rec.events = st.rec.events.filter((e) => !(e.type === 'click' && e.t > now + 50));
    },
  };
}

async function hold(seg, rec, durMs) {
  st.ctl.kneel = false;
  const start = performance.now();
  const cap = st.inPositionSince ? st.inPositionSince + MAX_IN_POSITION - start : Infinity;
  const dur = Math.max(S(1), Math.min(durMs, cap));
  setPhase('hold', dur);
  st.rec.event('hold_start', { seg: rec.i, ms: Math.round(dur), ...(dur < durMs && { capped: true }) });
  voice.play('p_go', { priority: 2 });
  const cues = (seg.cues ?? []).map((c) => ({ ...c, atMs: S(c.at), firedAt: null }));
  // "Дыши ровно" in every hold (plan §6.5); not over the clicks of the beat.
  const breatheAt = seg.beat || dur < S(12) ? null : S(10);
  let breathed = false;
  st.beat = seg.beat ? scheduleBeat(seg.beat, start) : null;
  let standCue = null;
  let reason = null;

  const r = await waitFor(() => {
    const now = performance.now();
    const el = now - start;
    for (const c of cues) {
      if (c.firedAt === null && el >= c.atMs) {
        c.firedAt = now;
        voice.play(c.line, { priority: 2 });
        st.rec.event('cue', { seg: rec.i, line: c.line, ...(c.expect && { expect: c.expect, forMs: Math.round(S(c.for)) }) });
        if (c.expect) st.cueWindows.push({ from: now, to: now + S(c.for) + 2000, expect: c.expect, endOnPause: !!c.endOnPause });
        if (c.endOnPause) standCue = c;
      }
    }
    if (breatheAt !== null && !breathed && el >= breatheAt && !voice.busy) {
      breathed = true;
      voice.play('breathe', { priority: 1 });
      st.rec.event('voice', { line: 'breathe', seg: rec.i });
    }
    const p = st.pause;
    if (p) {
      if (standCue && p.expected) return 'done';
      if (now - p.start > (p.expected ? EXPECTED_STOP_MS : PAUSE_STOP_MS)) {
        reason = p.reason;
        return 'auto_stop';
      }
    }
    return el >= dur ? 'done' : false;
  }, Infinity, { kneel: true });

  const end = performance.now();
  // "Встань": how long from the prompt until the app noticed (the hold ends on that pause).
  if (standCue) rec.standDetectMs = st.pause?.expected && standCue.firedAt ? Math.round(st.pause.start - standCue.firedAt) : null;
  if (st.pause) closePause(end, true);
  st.beat?.stop();
  st.beat = null;
  st.cueWindows = [];
  const heldMs = Math.round(end - start);
  st.rec.event('hold_end', { seg: rec.i, result: r, heldMs, ...(reason && { reason }) });
  if (r === 'auto_stop') sound.warn();
  if ((r === 'done' && !standCue) || r === 'auto_stop') voice.play('p_rest', { priority: 2 });
  return { result: r, heldMs, reason };
}

async function rest(sec, next) {
  // Samples during rest keep the previous segment index (with phase = rest).
  setPhase('rest', S(sec), next.title);
  st.rec.event('rest', { seg: st.segIndex, ms: Math.round(S(sec)) });
  const r = await waitFor(null, S(sec));
  if (r === 'skip') {
    st.rec.event('rest_skip', { seg: st.segIndex });
    st.ctl.skip = false;
  }
}

function finishRun() {
  stopEverything();
  st.device.run = perfStats(st.perf);
  st.device.voice = { ...st.device.voice, via: { ...voice.stats.via } };
  // Latency from the recorded samples, the same code tools/field-report runs.
  st.latency = latencyFromFile(draftFile());
  showFeedback();
}

function stopEverything() {
  stopFrames?.();
  stopFrames = null;
  stopCamera(video);
  clearCanvas(overlay);
  tracker.close();
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

// ---------------- run screen ----------------

function bindRun() {
  $('#pr-skip').addEventListener('click', () => {
    st.ctl.skip = true;
    voice.stop();
  });
  $('#pr-knees').addEventListener('click', () => {
    st.kneel = !st.kneel;
    st.rec.event('kneel', { seg: st.segIndex, on: st.kneel, phase: st.phase });
    // In a measured phase the position changes: recalibrate (the runner listens for this).
    if (['calibrate', 'countdown', 'hold'].includes(st.phase)) st.ctl.kneel = true;
  });
  // Two taps to stop: a stray touch from the floor shouldn't end the test.
  const stop = $('#pr-stop');
  let armed = 0;
  stop.addEventListener('click', () => {
    if (performance.now() - armed < 3000) {
      st.ctl.stop = true;
      voice.stop();
      st.rec.event('stop', { seg: st.segIndex, phase: st.phase });
      return;
    }
    armed = performance.now();
    stop.classList.add('armed');
    stop.textContent = 'Нажми ещё раз';
    setTimeout(() => {
      stop.classList.remove('armed');
      stop.textContent = 'Закончить';
    }, 3000);
  });
}

const view = {};
function setText(id, value) {
  if (view[id] === value) return;
  view[id] = value;
  document.getElementById(id).textContent = value;
}

function render() {
  if (st.step !== 'run') return;
  requestAnimationFrame(render);
  const now = performance.now();
  const seg = st.seg;
  const el = now - st.phaseStart;
  const left = Math.max(0, st.phaseDur - el);
  const pose = st.pose;
  let big = '';
  let ring = 0;
  let phase = '';
  let title = seg?.title ?? 'Проверка';
  let hint = seg?.hint ?? '';
  let bad = false;

  switch (st.phase) {
    case 'intro':
      phase = st.segIndex < 0 ? 'Начинаем' : 'Следующий отрезок';
      big = st.segIndex < 0 ? '' : String(st.segIndex + 1);
      if (st.segIndex < 0) {
        title = 'Проверка';
        hint = 'Держи только до сигнала. Любой отрезок можно сделать на коленях или пропустить. Боль, головокружение, одышка — сразу остановись.';
      }
      break;
    case 'calibrate': {
      phase = 'Займи позицию и замри';
      ring = st.calibProgress;
      const side = st.camera === 'side';
      if (!pose?.present) hint = side ? 'Не вижу тебя целиком: всё тело должно быть в кадре.' : 'Не вижу лица: свет спереди, телефон в 50–80 см, смотри на экран.';
      else if (pose.rawIssue) hint = ISSUE_TEXT[pose.rawIssue] ?? hint;
      else hint = 'Хорошо, замри на секунду…';
      break;
    }
    case 'countdown':
      phase = 'Приготовься';
      big = String(Math.max(1, Math.ceil(left / 1000 / SCALE)));
      ring = st.phaseDur ? el / st.phaseDur : 0;
      break;
    case 'hold':
      phase = st.pause ? 'Пауза' : 'Держи';
      big = String(Math.ceil(left / 1000 / SCALE));
      ring = st.phaseDur ? left / st.phaseDur : 0;
      if (st.pause) {
        bad = !st.pause.expected;
        hint = PAUSE_TEXT[st.pause.reason] ?? 'Вернись в планку';
      }
      if (seg?.beat && st.beat) {
        const k = st.beat.heard.filter((h) => h <= now).length;
        big = k ? `${k}` : String(Math.ceil(left / 1000 / SCALE));
        hint = k ? `Щелчок ${k} из ${st.beat.heard.length}: ${k % 2 ? 'влево' : 'вправо'}` : 'Сейчас пойдут щелчки: первый — влево';
      }
      break;
    case 'rest':
      phase = st.note === 'calib' ? 'Не получилось поймать позицию' : 'Отдых';
      title = st.note === 'calib' ? 'Отдохни' : 'Отдыхай';
      hint = st.note === 'calib'
        ? 'Сейчас попробуем ещё раз. Проверь: свет спереди, лицо или тело в кадре, расстояние.'
        : `Дальше: ${st.note}. Дыши ровно.`;
      big = String(Math.ceil(left / 1000 / SCALE));
      ring = st.phaseDur ? left / st.phaseDur : 0;
      break;
    case 'end':
      phase = 'Готово';
      title = 'Проверка закончена';
      hint = 'Спасибо! Осталось несколько вопросов.';
      break;
    default:
      break;
  }

  setText('pr-count', st.segIndex >= 0 ? `${st.segIndex + 1} / ${st.scenario.length}` : '');
  setText('pr-phase', phase);
  setText('pr-title', title);
  setText('pr-hint', hint);
  setText('pr-big', big);
  $('#pr-phase').classList.toggle('bad', bad);
  $('#pr-ring').classList.toggle('paused', bad);
  $('#pr-ring-fg').style.strokeDashoffset = String(327 * (1 - Math.max(0, Math.min(1, ring))));
  $('#p-run').classList.toggle('calibrating', st.phase === 'calibrate');
  cam.dataset.size = st.phase === 'calibrate' ? 'big' : 'small';
  const measured = st.phase === 'hold' || st.phase === 'countdown';
  cam.classList.toggle('ok', !!pose?.formOk);
  cam.classList.toggle('bad', measured && !pose?.formOk);

  const form = $('#pr-form');
  form.hidden = !(measured || st.phase === 'calibrate');
  form.classList.toggle('ok', measured && !!pose?.formOk);
  form.classList.toggle('bad', measured && !pose?.formOk);
  setText('pr-form-text', st.phase === 'calibrate' ? 'Калибровка' : pose?.formOk ? 'Позиция в порядке' : PAUSE_TEXT[pose?.issue] ?? 'Вернись в планку');

  // Steering meter on the segments that ask for full deflection.
  const meter = $('#pr-meter');
  meter.hidden = !(seg?.steer && measured);
  if (!meter.hidden) {
    const axis = seg.steer;
    const v = pose?.control?.[axis] ?? 0;
    setText('pr-meter-a', axis === 'y' ? 'назад' : 'влево');
    setText('pr-meter-b', axis === 'y' ? 'вперёд' : 'вправо');
    $('#pr-dot').style.left = `${50 + (Math.max(-1.2, Math.min(1.2, v)) / 1.2) * 50}%`;
    const target = seg.beat && st.beat ? (st.beat.heard.filter((h) => h <= now).length % 2 ? -1 : 1) : 0;
    for (const m of meter.querySelectorAll('.p-mark')) {
      const s = Number(m.dataset.side);
      m.classList.toggle('hit', s * v >= 1);
      m.classList.toggle('target', seg.beat ? st.beat && st.beat.heard[0] <= now && s === target : false);
    }
  }

  const knees = $('#pr-knees');
  knees.hidden = !!seg?.knees || st.phase === 'end';
  knees.setAttribute('aria-pressed', String(st.kneel));
  setText('pr-knees', st.kneel ? 'На носках' : 'На коленях');
  setText('pr-skip', st.phase === 'rest' ? 'Дальше' : 'Пропустить');
  $('#pr-skip').hidden = st.phase === 'end';
}

// ---------------- feedback ----------------

const ANSWERS = ['neck', 'amplitude', 'falsePauses', 'fun', 'loadSpeed'];

function showFeedback() {
  showStep('feedback');
  $('#p-stopped').hidden = st.ended !== 'stopped';
  const list = $('#p-pauses');
  list.innerHTML = '';
  if (!st.pauses.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Автоматических пауз не было.';
    list.append(li);
  }
  for (const p of st.pauses) {
    const li = document.createElement('li');
    const segTitle = st.scenario[p.seg]?.title ?? '';
    li.innerHTML = '<span class="when"></span><span class="what"></span><label class="toggle"><input type="checkbox"><span>Эта пауза была зря</span></label>';
    li.querySelector('.when').textContent = fmtClock(p.start - st.rec.rel(st.runStart));
    li.querySelector('.what').textContent = `${segTitle} — ${PAUSE_TEXT[p.reason] ?? p.reason}, ${secText(p.ms)}`;
    if (p.expected) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'по сценарию';
      li.querySelector('.what').append(tag);
    }
    const box = li.querySelector('input');
    box.dataset.n = String(p.n);
    box.addEventListener('change', () => { p.falsePause = box.checked; });
    list.append(li);
  }
}

function readAnswers() {
  const out = {};
  for (const q of ANSWERS) {
    const v = document.querySelector(`input[name="pq-${q}"]:checked`)?.value ?? null;
    out[q] = v !== null && /^\d$/.test(v) ? Number(v) : v;
  }
  return out;
}

function bindFeedback() {
  const next = $('#p-feedback-next');
  $('#p-questions').addEventListener('change', () => {
    next.disabled = !ANSWERS.every((q) => readAnswers()[q] !== null);
  });
  next.addEventListener('click', async () => {
    next.disabled = true;
    st.answers = readAnswers();
    await prepareFile();
    showDone();
  });
}

// ---------------- the file ----------------

function draftFile() {
  return {
    schema: 'plank-run.protocol',
    v: PROTOCOL_VERSION,
    meta: {
      pseudonym: st.pseudonym,
      created: new Date(st.createdAt).toISOString(),
      app: APP_VERSION,
      camera: st.camera,
      scale: SCALE,
      consent: { v: CONSENT_VERSION, at: st.consentAt },
      ended: st.ended,
      durationMs: st.runStart ? Math.round(performance.now() - st.runStart) : 0,
    },
    device: st.device,
    analyzer: { thresholds: THRESHOLDS[st.camera], debounce: { onS: 0.25, offS: 0.45 }, model: st.device.model ?? null },
    codes: { phase: PHASES, issue: ISSUES },
    scenario: describeScenario(st.scenario),
    segments: st.segments,
    pauses: st.pauses,
    events: [...st.rec.events].sort((a, b) => a.t - b.t),
    samples: st.rec.toJSON(),
    latency: st.latency,
  };
}

// The whole export: derived numbers, answers, summary. Health answers (neck,
// back pain) sit in their own block without the pseudonym (plan D16, §12.1 item 6).
export function buildFile() {
  const a = st.answers ?? {};
  const file = draftFile();
  const at = (type) => st.rec.events.find((e) => e.type === type)?.t;
  if (at('run_end') !== undefined) file.meta.durationMs = at('run_end') - at('run_start');
  file.feedback = { amplitude: a.amplitude ?? null, falsePauses: a.falsePauses ?? null, fun: a.fun ?? null, loadSpeed: a.loadSpeed ?? null };
  file.health = { neck: a.neck ?? null, backPain: st.backPain };
  file.summary = computeSummary(file);
  return file;
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };

// Latin only in the file name: messengers and mail clients mangle the rest.
function fileSlug(name) {
  const s = [...name.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s.slice(0, 24) || 'anon';
}

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function prepareFile() {
  st.file = buildFile();
  st.packed = await packJson(st.file);
  st.filename = `plank-protocol-${fileSlug(st.pseudonym)}-${stamp(st.createdAt)}.json${st.packed.gz ? '.gz' : ''}`;
  return { file: st.file, filename: st.filename, gz: st.packed.gz, size: st.packed.blob.size };
}

function shareableFile() {
  return new File([st.packed.blob], st.filename, { type: st.packed.blob.type });
}

function canShareFile() {
  try {
    return !!navigator.canShare?.({ files: [shareableFile()] });
  } catch {
    return false;
  }
}

function bindDone() {
  const status = $('#p-send-status');
  $('#p-share').addEventListener('click', async () => {
    try {
      await navigator.share({ files: [shareableFile()], title: 'Plank Run — проверка', text: 'Файл проверки Plank Run' });
      st.sent = true;
      status.textContent = 'Готово. Если передумал(а) — можно скачать файл ещё раз.';
    } catch (err) {
      if (err?.name !== 'AbortError') status.textContent = `Не получилось отправить (${err?.message ?? err}). Нажми «Скачать файл» и отправь его из загрузок.`;
    }
  });
  $('#p-download').addEventListener('click', () => {
    const url = URL.createObjectURL(st.packed.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = st.filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    st.sent = true;
    status.textContent = 'Файл сохранён в загрузки. Отправь его владельцу проекта в мессенджере или почтой.';
  });
}

function showDone() {
  showStep('done');
  const s = st.file.summary;
  const c = s.calibration;
  const lat = s.latency;
  const cells = [
    [c.firstMs === null ? 'нет' : secText(c.firstMs), c.firstAttempts > 1 ? `калибровка (попыток: ${c.firstAttempts})` : 'первая калибровка'],
    [s.pauses.falsePerMin === null ? '—' : `${String(s.pauses.falsePerMin).replace('.', ',')}/мин`, `ложных пауз на ровных (всего пауз: ${s.pauses.total})`],
    [s.steering.maxAbs === null ? '—' : `−${s.steering.maxNeg} … +${s.steering.maxPos}`.replace(/\./g, ','), 'размах руля (нужно ±1)'],
    [lat.ms === null ? '—' : `${lat.ms} мс`, lat.confidence === 'ok' ? 'задержка тела' : 'задержка тела (неуверенно)'],
    [s.perf.fps === null ? '—' : `${String(s.perf.fps).replace('.', ',')} к/с`, `инференс ${s.perf.inferenceP50}/${s.perf.inferenceP95} мс`],
    [secText(s.perf.loadMs), 'загрузка модели'],
    [`${s.segments.done} из ${s.segments.planned}`, 'отрезков сделано'],
  ];
  const grid = $('#p-summary');
  grid.innerHTML = '';
  for (const [v, k] of cells) {
    const div = document.createElement('div');
    div.innerHTML = '<span class="v"></span><span class="k"></span>';
    div.querySelector('.v').textContent = v;
    div.querySelector('.k').textContent = k;
    grid.append(div);
  }
  $('#p-filename').textContent = `${st.filename} · ${Math.max(1, Math.round(st.packed.blob.size / 1024))} КБ`;
  $('#p-share').hidden = !canShareFile();
  $('#p-download').classList.toggle('primary', $('#p-share').hidden);
  $('#p-download').classList.toggle('ghost', !$('#p-share').hidden);
}

// Hook for automated tests (test/protocol.mjs) and DevTools.
window.__protocol = {
  get state() {
    return {
      step: st.step,
      phase: st.phase,
      seg: st.seg?.id ?? null,
      segIndex: st.segIndex,
      calibrated: st.analyzer?.calibrated ?? false,
      pauses: st.pauses.length,
      paused: !!st.pause,
      scale: SCALE,
      filename: st.filename,
    };
  },
  buildFile,
  prepareFile,
  get packed() {
    return st.packed;
  },
};
