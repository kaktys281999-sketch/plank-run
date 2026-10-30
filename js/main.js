import { VisionTracker, startCamera, stopCamera, onEveryVideoFrame } from './pose.js';
import { PlankAnalyzer, ISSUE_TEXT } from './plank.js';
import { TunnelGame } from './games/tunnel.js';
import { FirefliesGame } from './games/fireflies.js';
import { Sound } from './audio.js';
import { VoicePlayer } from './voice.js';
import { GAME_LINE_IDS } from './voice-lines.js';
import { drawSkeleton, drawFace, clearCanvas } from './draw.js';
import { loadSettings, saveSettings, loadHistory, addSession, loadSafety, saveSafety } from './storage.js';
import { FLAGS } from './config.js';

const $ = (sel) => document.querySelector(sel);

const END_AFTER = 4;  // seconds of broken form before the set ends
const COUNTDOWN = 3;
// D2 by the clock: a set ends 45 s after the countdown, pauses included. `held` grows
// only with good form, so without this short breaks could stretch a set past 45 s.
const SET_LIMIT = 45;
const SAFETY_VERSION = 1;

// Form issue -> voice line id (texts and clips: js/voice-lines.js, assets/voice/).
const VOICE = {
  sag: 'lift_hips',
  noFace: 'look_screen',
  pike: 'lower_hips',
  knees: 'straighten_legs',
  lost: 'cant_see',
  notVisible: 'cant_see',
  standing: 'back_to_plank',
  lying: 'back_to_plank',
  moved: 'back_to_place',
  noSupport: 'press_floor',
  tooFar: 'come_closer',
};

const COLORS = {
  track: 'rgba(124, 108, 255, 0.07)',
  grid: 'rgba(124, 108, 255, 0.35)',
  edge: '#7c6cff',
  gate: '#7c6cff',
  pass: '#5ef2c2',
  hit: '#ff5d7a',
  coin: '#ffd25e',
  player: '#5ef2c2',
};

// Every game implements: setInput({x, y}), update(dt, running), render(colors), resume(),
// setDifficultyHorizon(s), hint(camera), hudStats(), summary(), plus score / combo.
const GAMES = {
  fireflies: { title: 'Светлячки', cameras: ['front'], create: (canvas, opts) => new FirefliesGame(canvas, opts) },
  tunnel: { title: 'Тоннель', cameras: ['front', 'side'], create: (canvas, opts) => new TunnelGame(canvas, opts) },
};

const settings = loadSettings();
const sound = new Sound();
const voice = new VoicePlayer(sound, { lines: GAME_LINE_IDS });
const tracker = new VisionTracker();
const video = $('#video');
const overlay = $('#overlay');

let analyzer = null;
let game = null;
let session = null;
let pose = null;
let stopFrames = null;
let wakeLock = null;
let showDebug = FLAGS.debug;
const perf = { frames: 0, since: 0, fps: 0, ms: 0 };

// ---------------- formatting ----------------

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------- voice ----------------

// Pre-rendered clip, speechSynthesis when the clip is missing (js/voice.js).
// The same line is not repeated more often than `minGap` seconds.
const lastSaid = new Map();

function say(id, { minGap = 4, interrupt = false } = {}) {
  if (!sound.voice) return;
  const now = performance.now() / 1000;
  if (now - (lastSaid.get(id) ?? -Infinity) < minGap) return;
  lastSaid.set(id, now);
  voice.play(id, { interrupt });
}

// ---------------- home screen ----------------

function showScreen(name) {
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
}

function bindSettings() {
  const home = $('#home');
  for (const name of ['game', 'camera', 'control', 'target', 'model']) {
    for (const input of home.querySelectorAll(`input[name="${name}"]`)) {
      input.checked = String(settings[name]) === input.value;
      input.addEventListener('change', () => {
        settings[name] = name === 'target' ? Number(input.value) : input.value;
        saveSettings(settings);
        refreshSettingsUi();
      });
    }
  }
  for (const name of ['kneePlank', 'sound', 'voice', 'showCamera']) {
    const input = home.querySelector(`input[name="${name}"]`);
    input.checked = !!settings[name];
    input.addEventListener('change', () => {
      settings[name] = input.checked;
      saveSettings(settings);
    });
  }
  const sens = $('#sensitivity');
  sens.value = settings.sensitivity;
  const out = $('#sens-out');
  const showSens = () => { out.textContent = `${Number(sens.value).toFixed(1)}×`; };
  showSens();
  sens.addEventListener('input', () => {
    settings.sensitivity = Number(sens.value);
    showSens();
    saveSettings(settings);
  });
  refreshSettingsUi();
}

function refreshSettingsUi() {
  // Some games need both axes, which only the front camera (face tracking) gives.
  const def = GAMES[settings.game] ?? GAMES.fireflies;
  for (const input of document.querySelectorAll('input[name="camera"]')) {
    const allowed = def.cameras.includes(input.value);
    input.disabled = !allowed;
    input.closest('.choice').classList.toggle('disabled', !allowed);
  }
  if (!def.cameras.includes(settings.camera)) {
    settings.camera = def.cameras[0];
    document.querySelector(`input[name="camera"][value="${settings.camera}"]`).checked = true;
    saveSettings(settings);
  }
  $('#camera-note').hidden = def.cameras.includes('side');
  // Side camera always uses forward/back rocking; the model choice only matters for the pose model.
  $('#field-control').hidden = settings.camera === 'side' || settings.game !== 'tunnel';
  $('#field-model').hidden = settings.camera !== 'side';
  $('#field-knee').hidden = settings.camera !== 'side';
}

function renderHistory() {
  const history = loadHistory();
  $('#history-card').hidden = history.length === 0;
  if (!history.length) return;
  // No "best hold" cell: praising hold length breaks D2. Targets are capped at 45 s, so hitting one is safe to count.
  const goals = history.filter((h) => h.target > 0 && h.held >= h.target).length;
  const bestScore = Math.max(...history.map((h) => h.score));
  const total = history.reduce((a, h) => a + h.held, 0);
  $('#bests').innerHTML = '';
  for (const [v, k] of [[goals, 'целей выполнено'], [bestScore, 'рекорд очков'], [history.length, 'подходов'], [fmtTime(total), 'всего в планке']]) {
    const div = document.createElement('div');
    div.innerHTML = '<span class="v"></span><span class="k"></span>';
    div.querySelector('.v').textContent = v;
    div.querySelector('.k').textContent = k;
    $('#bests').append(div);
  }
  const list = $('#history');
  list.innerHTML = '';
  for (const h of history.slice(0, 8)) {
    const li = document.createElement('li');
    const date = new Date(h.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    li.innerHTML = '<span></span><span></span>';
    li.children[0].textContent = date;
    const title = GAMES[h.game]?.title ?? GAMES.tunnel.title;
    li.children[1].textContent = `${title} · ${fmtTime(h.held)} из ${fmtTime(h.target)} · ${h.score} очков · техника ${Math.round(h.formPct * 100)}%`;
    list.append(li);
  }
}

function showError(text) {
  const el = $('#start-error');
  el.textContent = text;
  el.hidden = !text;
}

// ---------------- session ----------------

function showLoading(text) {
  $('#loading').hidden = false;
  $('#loading-text').textContent = text;
}

function hideLoading() {
  $('#loading').hidden = true;
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && session.phase !== 'over') requestWakeLock();
});

async function start(demo) {
  // Everything that needs a user gesture happens before the first await.
  sound.unlock();
  sound.enabled = settings.sound;
  sound.voice = settings.voice;
  sound.prime();
  // Starts decoding clips inside the gesture; prompts before they are ready fall back to speech.
  if (settings.voice) voice.load();
  document.documentElement.requestFullscreen?.().catch(() => {});
  showError('');

  const axis = settings.camera === 'side' ? 'y' : settings.control;
  game = (GAMES[settings.game] ?? GAMES.fireflies).create($('#game'), { axis, onEvent: onGameEvent });
  game.setDifficultyHorizon(settings.target);
  analyzer = new PlankAnalyzer({ ...settings });
  pose = null;
  session = {
    demo, axis,
    phase: null, phaseStart: 0, holdStart: null,
    held: 0, broken: 0, breaks: 0,
    lastMilestone: 0, lastVoice: 0,
    calibProgress: 0,
    demoInput: { x: 0, y: 0, vx: 0, vy: 0, broken: false },
  };
  showScreen('play');
  $('#cam').classList.toggle('hidden', demo || !settings.showCamera);

  if (!demo) {
    showLoading('Включаю камеру…');
    try {
      await startCamera(video);
      await tracker.init(settings.camera === 'side' ? 'pose' : 'face', settings.model, showLoading);
    } catch (err) {
      hideLoading();
      stopCamera(video);
      exitPlay();
      showError(err.message);
      return;
    }
    hideLoading();
    stopFrames = onEveryVideoFrame(video, onPoseFrame);
    setPhase('calibrate');
    say(settings.camera === 'side' ? 'get_in_plank_side' : 'get_in_plank_front', { interrupt: true });
  } else {
    setPhase('countdown');
  }
  requestWakeLock();
  lastFrame = performance.now();
  const s = session;
  requestAnimationFrame((now) => loop(now, s));
}

function setPhase(phase) {
  session.phase = phase;
  session.phaseStart = performance.now() / 1000;
  // The SET_LIMIT clock starts once the countdown is over, whether it ran out or form broke.
  if (session.holdStart === null && (phase === 'play' || phase === 'paused')) session.holdStart = session.phaseStart;
  $('#play').classList.toggle('calibrating', phase === 'calibrate');
  if (phase === 'calibrate') {
    $('#cam').classList.remove('hidden');
  } else {
    $('#cam').classList.toggle('hidden', session.demo || !settings.showCamera);
  }
}

function onPoseFrame(now) {
  if (!session || session.phase === 'over') return;
  const det = tracker.detect(video);
  if (det === null) return;
  const t = now / 1000;
  pose = analyzer.update(det, video.videoWidth, video.videoHeight, t);
  if (session.phase === 'calibrate') session.calibProgress = analyzer.calibrate(pose, t);

  perf.frames += 1;
  perf.ms = perf.ms ? perf.ms * 0.9 + det.ms * 0.1 : det.ms;
  if (now - perf.since > 1000) {
    perf.fps = (perf.frames * 1000) / (now - perf.since);
    perf.frames = 0;
    perf.since = now;
  }

  const color = pose.formOk ? '#5ef2c2' : pose.ready ? '#ffb547' : '#ff5d7a';
  if (tracker.kind === 'face') drawFace(overlay, video, det.face, color);
  else drawSkeleton(overlay, video, det.landmarks, color);
}

function onGameEvent(type, data) {
  if (type === 'coin') sound.coin();
  else if (type === 'pass') sound.pass(data);
  else if (type === 'hit') sound.hit();
  else if (type === 'catch') sound.chime(data.combo, data.type);
  else if (type === 'jar') {
    sound.win();
    say('jar_full', { minGap: 2 });
  }
}

let lastFrame = 0;

// `owner` ties the loop to its session, so a quick restart never runs two loops at once.
function loop(now, owner) {
  if (session !== owner || session.phase === 'over') return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = now / 1000;
  const s = session;

  let input;
  let ok;
  let issue;
  if (s.demo) {
    const d = s.demoInput;
    d.x = Math.max(-1, Math.min(1, d.x + d.vx * dt * 2.2));
    d.y = Math.max(-1, Math.min(1, d.y + d.vy * dt * 2.2));
    input = d;
    ok = !d.broken;
    issue = ok ? null : 'sag';
  } else {
    input = pose?.control ?? { x: 0, y: 0 };
    ok = !!pose?.formOk;
    issue = pose?.issue ?? 'lost';
  }
  game.setInput(input);
  if (clockLimit(t)) return;

  const inPhase = t - s.phaseStart;
  switch (s.phase) {
    case 'calibrate':
      game.update(dt, false);
      showCalibration();
      if (analyzer.calibrated) {
        say('great_hold', { interrupt: true });
        setPhase('countdown');
      }
      break;

    case 'countdown': {
      game.update(dt, false);
      if (!ok) {
        pauseFor(issue);
        break;
      }
      s.held += dt;
      const left = Math.ceil(COUNTDOWN - inPhase);
      if (left !== s.lastTick && left > 0) {
        s.lastTick = left;
        sound.tick();
      }
      showMessage({ big: String(Math.max(1, left)), title: 'Приготовься', text: game.hint(settings.camera), progress: inPhase / COUNTDOWN });
      if (inPhase >= COUNTDOWN) {
        sound.go();
        hideMessage();
        setPhase('play');
      }
      break;
    }

    case 'play':
      if (!ok) {
        pauseFor(issue);
        game.update(dt, false);
        break;
      }
      s.held += dt;
      game.update(dt, true);
      if (milestones()) return;
      break;

    case 'paused': {
      s.broken += dt;
      game.update(dt, false);
      if (ok) {
        game.resume();
        hideMessage();
        sound.go();
        setPhase('play');
        break;
      }
      const left = END_AFTER - inPhase;
      if (left <= 0) {
        finish('form');
        return;
      }
      if (t - s.lastVoice > 3) {
        s.lastVoice = t;
        say(VOICE[issue] ?? 'back_to_plank', { minGap: 2.5 });
      }
      showMessage({ big: String(Math.ceil(left)), title: ISSUE_TEXT[issue] ?? 'Вернись в планку', text: 'Игра на паузе — исправь положение, и она продолжится', progress: left / END_AFTER, bad: true });
      break;
    }
  }

  game.render(COLORS);
  updateHud(ok, issue);
  if (showDebug) updateDebug();
  requestAnimationFrame((n) => loop(n, owner));
}

function pauseFor(issue) {
  const s = session;
  s.breaks += 1;
  s.lastVoice = performance.now() / 1000;
  sound.warn();
  say(VOICE[issue] ?? 'back_to_plank', { minGap: 2, interrupt: true });
  setPhase('paused');
}

// The set ends at the target: no holding on to failure (plan §6.5).
// Returns true when the session has finished.
function milestones() {
  const s = session;
  const T = settings.target;
  if (s.held >= T) {
    sound.win();
    say('goal', { interrupt: true });
    finish('target');
    return true;
  }
  // A breathing reminder every 10 s; near the end it also counts down.
  const m = Math.floor(s.held / 10);
  if (m > s.lastMilestone) {
    s.lastMilestone = m;
    sound.tick();
    // Targets are 20 / 30 / 45 s, so near the end exactly 10 or 5 s are left.
    const left = Math.round(T - s.held);
    say(left <= 5 ? 'five_left' : left <= 10 ? 'ten_left' : 'breathe', { minGap: 5, interrupt: true });
  }
  return false;
}

// SET_LIMIT works in every phase, pauses and recalibration included. The set ends as calmly
// as at the target: no "fell short", no record of time. Returns true when the session has finished.
function clockLimit(t) {
  const s = session;
  if (s.holdStart === null || t - s.holdStart < SET_LIMIT) return false;
  sound.win();
  say('p_rest', { interrupt: true });
  finish('limit');
  return true;
}

// ---------------- HUD / overlays ----------------

function showMessage({ big = '', title = '', text = '', progress = 0, bad = false, checklist = false }) {
  const msg = $('#msg');
  msg.hidden = false;
  msg.classList.toggle('bad', bad);
  $('#msg-big').textContent = big;
  $('#msg-title').textContent = title;
  $('#msg-text').textContent = text;
  $('#msg-ring-fg').style.strokeDashoffset = String(327 * (1 - Math.max(0, Math.min(1, progress))));
  $('#checklist').hidden = !checklist;
}

function hideMessage() {
  $('#msg').hidden = true;
}

function showCalibration() {
  const p = pose;
  const side = settings.camera === 'side';
  let title = side ? 'Займи планку боком к камере' : 'Займи планку лицом к экрану';
  let text = side
    ? 'Всё тело должно быть в кадре — от головы до стоп. Выпрями корпус и замри.'
    : 'Телефон на полу в 50–80 см перед руками, экраном к тебе. Встань в ровную планку, смотри на экран и замри — я запомню позицию.';
  if (!p?.present) text = 'Не вижу тебя. Проверь, что камера смотрит на тебя и хватает света.';
  else if (p.rawIssue && ISSUE_TEXT[p.rawIssue]) title = ISSUE_TEXT[p.rawIssue];
  showMessage({ big: '', title, text, progress: session.calibProgress, checklist: true });
  const checks = p?.checks ?? {};
  for (const li of $('#checklist').children) {
    const key = li.dataset.check;
    const mode = li.dataset.mode;
    li.hidden = (mode && mode !== settings.camera) || (key === 'knees' && settings.kneePlank);
    const okNow = key === 'still' ? session.calibProgress > 0.15 : !!checks[key];
    li.classList.toggle('ok', okNow);
  }
}

const hudCache = {};
function setText(id, value) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  document.getElementById(id).textContent = value;
}

function updateHud(ok, issue) {
  const s = session;
  setText('hud-timer', fmtTime(s.held));
  const [[k1, v1], [k2, v2]] = game.hudStats();
  setText('hud-k1', k1);
  setText('hud-score', String(v1));
  setText('hud-k2', k2);
  setText('hud-coins', String(v2));
  setText('hud-target', `цель ${fmtTime(settings.target)}`);
  $('#hud-timer').classList.toggle('done', s.held >= settings.target);
  $('#hud-progress').style.width = `${Math.min(100, (s.held / settings.target) * 100)}%`;
  const combo = $('#hud-combo');
  combo.hidden = game.combo < 2;
  setText('hud-combo', `×${game.combo}`);
  const form = $('#hud-form');
  const calibrating = s.phase === 'calibrate';
  form.classList.toggle('ok', ok && !calibrating);
  form.classList.toggle('bad', !ok && !calibrating);
  const label = calibrating ? 'Калибровка' : ok ? 'Техника в порядке' : ISSUE_TEXT[issue] ?? 'Вернись в планку';
  if (hudCache.form !== label) {
    hudCache.form = label;
    form.querySelector('span').textContent = label;
  }
}

function updateDebug() {
  const el = $('#debug');
  el.hidden = false;
  const p = pose;
  const round = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v])) : o);
  el.textContent = [
    `phase: ${session.phase}  delegate: ${tracker.delegate ?? '-'}  model: ${tracker.modelKey ?? '-'}`,
    `vision fps: ${perf.fps.toFixed(1)}  inference: ${perf.ms.toFixed(1)} ms`,
    `present: ${p?.present}  ready: ${p?.ready}  formOk: ${p?.formOk}  raw: ${p?.rawIssue}`,
    `control: ${JSON.stringify(round(p?.control))}`,
    `checks: ${JSON.stringify(p?.checks ?? {})}`,
    `features: ${JSON.stringify(round(p?.f))}`,
    `baseline: ${analyzer?.baseline ? 'yes' : 'no'}`,
  ].join('\n');
}

// ---------------- finish / results ----------------

function exitPlay() {
  stopFrames?.();
  stopFrames = null;
  stopCamera(video);
  clearCanvas(overlay);
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  hideMessage();
  $('#debug').hidden = true;
  showScreen('home');
  renderHistory();
}

function finish(reason) {
  const s = session;
  if (!s || s.phase === 'over') return;
  s.phase = 'over';
  // Records count points within the same game, never seconds held (D2).
  const previousBest = Math.max(0, ...loadHistory().filter((h) => h.game === settings.game).map((h) => h.score ?? 0));
  const result = {
    date: Date.now(),
    held: Math.round(s.held * 10) / 10,
    target: settings.target,
    game: settings.game,
    score: game.score,
    bestCombo: game.bestCombo,
    summary: game.summary(),
    breaks: s.breaks,
    formPct: s.held + s.broken > 0 ? s.held / (s.held + s.broken) : 1,
    camera: settings.camera,
    axis: s.axis,
    reason,
  };
  if (!s.demo && s.held >= 3) addSession(result);
  exitPlay();
  showResults(result, previousBest, s.demo);
}

function showResults(r, previousBest, demo) {
  showScreen('results');
  $('#res-reason').textContent = demo
    ? 'Демо-режим: результат не сохраняется'
    : reasonText(r.reason);
  $('#res-time').textContent = fmtTime(r.held);
  const record = !demo && r.score > previousBest && previousBest > 0;
  $('#res-sub').textContent = subText(r, record);
  const grid = $('#res-grid');
  grid.innerHTML = '';
  const cells = [...r.summary, [`${Math.round(r.formPct * 100)}%`, 'времени с хорошей техникой'], [r.breaks, 'срывов техники']];
  for (const [v, k] of cells) {
    const div = document.createElement('div');
    div.innerHTML = '<span class="v"></span><span class="k"></span>';
    div.querySelector('.v').textContent = v;
    div.querySelector('.k').textContent = k;
    grid.append(div);
  }
  $('#res-tip').textContent = tipFor(r);
}

function subText(r, record) {
  if (record) return 'Новый рекорд очков!';
  if (r.held >= r.target) return `Цель ${fmtTime(r.target)} выполнена!`;
  // The clock ended the set: it is simply over, nothing "fell short".
  if (r.reason === 'limit') return `Подход длится не дольше ${SET_LIMIT} с, паузы тоже в счёт`;
  return `Цель ${fmtTime(r.target)}: не хватило ${Math.ceil(r.target - r.held)} с`;
}

function reasonText(reason) {
  if (reason === 'target') return 'Цель выполнена — отдыхай';
  if (reason === 'limit') return `Прошло ${SET_LIMIT} с, отдыхай`;
  if (reason === 'form') return `Подход завершён: техника нарушена дольше ${END_AFTER} с`;
  return 'Подход завершён';
}

function tipFor(r) {
  if (r.breaks >= 3 || r.formPct < 0.8) return 'Техника часто срывалась. Лучше короче, но ровно: поставь цель поменьше и держи идеальную линию.';
  if (r.held >= r.target) return 'Цель выполнена. Больше 45 секунд за раз не держи: если хочется ещё, отдохни минуту и сделай второй подход.';
  return 'Регулярность важнее рекорда: 3–4 подхода в неделю дадут прогресс быстрее, чем один подход до отказа.';
}

// ---------------- input ----------------

function bindInput() {
  $('#start').addEventListener('click', () => (safetyOk() ? start(false) : showSafety()));
  $('#demo').addEventListener('click', () => start(true));
  $('#again').addEventListener('click', () => {
    const demo = session?.demo ?? false;
    if (!demo && !safetyOk()) showSafety();
    else start(demo);
  });
  $('#to-home').addEventListener('click', () => { showScreen('home'); renderHistory(); });
  $('#finish').addEventListener('click', () => finish('manual'));
  $('#recalibrate').addEventListener('click', recalibrate);

  window.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'play' || !session) return;
    const d = session.demoInput;
    if (e.key === 'Escape') finish('manual');
    else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') recalibrate();
    else if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') {
      showDebug = !showDebug;
      $('#debug').hidden = !showDebug;
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
      settings.showCamera = !settings.showCamera;
      $('#cam').classList.toggle('hidden', !settings.showCamera && session.phase !== 'calibrate');
    } else if (session.demo) {
      if (e.key === 'ArrowLeft') d.vx = -1;
      if (e.key === 'ArrowRight') d.vx = 1;
      if (e.key === 'ArrowUp') d.vy = 1;
      if (e.key === 'ArrowDown') d.vy = -1;
      if (e.key === ' ') { d.broken = !d.broken; e.preventDefault(); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (!session?.demo) return;
    const d = session.demoInput;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') d.vx = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') d.vy = 0;
  });
  $('#game').addEventListener('pointermove', (e) => {
    if (!session?.demo) return;
    const r = e.currentTarget.getBoundingClientRect();
    session.demoInput.x = ((e.clientX - r.left) / r.width) * 2.4 - 1.2;
    session.demoInput.y = 1.2 - ((e.clientY - r.top) / r.height) * 2.4;
  });
}

// ---------------- safety check before the first real set ----------------
// Only the yes/no outcome is kept, on this device; the answers themselves are not stored.

function safetyOk() {
  const s = loadSafety();
  return s?.version === SAFETY_VERSION && s.ok === true;
}

const SAFETY_QUESTIONS = ['q1', 'q2', 'q3', 'q4'];

// Where the safety gate leads. ?protocol reroutes "pass" and "back" into the field test,
// so the test reuses exactly the same questions and the same stored outcome.
const safetyRoute = {
  pass: () => start(false),
  back: () => showScreen('home'),
};

function showSafety() {
  const form = $('#safety-form');
  form.querySelectorAll('input').forEach((i) => { i.checked = false; });
  $('#safety-continue').disabled = true;
  form.hidden = false;
  $('#safety-stop').hidden = true;
  showScreen('safety');
}

function bindSafety() {
  const form = $('#safety-form');
  const answer = (q) => form.querySelector(`input[name="${q}"]:checked`)?.value;
  form.addEventListener('change', () => {
    $('#safety-continue').disabled = !(SAFETY_QUESTIONS.every(answer) && $('#safety-accept').checked);
  });
  $('#safety-continue').addEventListener('click', () => {
    const anyYes = SAFETY_QUESTIONS.some((q) => answer(q) === 'yes');
    saveSafety({ version: SAFETY_VERSION, ok: !anyYes, date: Date.now() });
    if (anyYes) {
      form.hidden = true;
      $('#safety-stop').hidden = false;
      window.scrollTo(0, 0);
    } else {
      safetyRoute.pass();
    }
  });
  $('#safety-back').addEventListener('click', () => safetyRoute.back());
  $('#safety-demo').addEventListener('click', () => start(true));
  $('#safety-redo').addEventListener('click', showSafety);
}

function recalibrate() {
  if (!session || session.demo || session.phase === 'over') return;
  analyzer.resetCalibration();
  session.calibProgress = 0;
  setPhase('calibrate');
}

// Hook for automated tests and for curious users in DevTools.
window.__plank = {
  get state() {
    return {
      screen: document.body.dataset.screen,
      phase: session?.phase ?? null,
      held: session?.held ?? 0,
      score: game?.score ?? 0,
      delegate: tracker.delegate,
      videoTime: video.currentTime,
      fps: perf.fps,
      inferenceMs: perf.ms,
      calibrated: analyzer?.calibrated ?? false,
      pose,
    };
  },
  get game() {
    return game;
  },
};

bindSettings();
bindInput();
bindSafety();
renderHistory();

// ?protocol: the Stage 0 field test (plan §12.1). Loaded only on demand, so the
// normal app neither downloads nor runs any of it.
if (FLAGS.protocol) {
  import('./protocol/protocol.js')
    .then((m) => m.initProtocol({ safetyOk, showSafety, safetyRoute, showScreen }))
    .catch((err) => {
      console.error(err);
      showScreen('home');
      showError(`Не удалось открыть проверку: ${err.message}`);
    });
}
