// Timer probe, design-v3 §8. A one-off page without a build, next to the look
// probe. On the owner's own phone it answers four things: do the digits read
// from where the phone lies, does the screen stay on, is the voice heard with
// the silent switch on, and does the loop «countdown, hold, rest» feel right.
// No camera, no 3D, no records; a hold is 20 s. The real app is planned in
// docs/PLAN.md §12.0; this code is thrown away after the probe.

import { ProbeSession, DEFAULTS, holdCues, prepCues } from './engine.js';
import { EXERCISES, LAYOUTS, byId } from './exercises.js';
import { ProbeSound } from './sound.js';
import { createMeasure, buildReport, deviceInfo, QUESTIONS } from './measure.js';
import { loadSafety, saveSafety } from '../../js/storage.js';

// The same safety gate and the same stored outcome as the prototype (js/main.js:16),
// so the owner answers the four questions once for both pages.
const SAFETY_VERSION = 1;
const SAFETY_QUESTIONS = ['q1', 'q2', 'q3', 'q4'];
const BLOCK_KEY = 'plank-run:probe-timer:block';

// ?fast only checks the page itself: everything is five times shorter and the report says so.
const FAST = new URLSearchParams(location.search).has('fast');
const TIMES = FAST ? { holdSec: 4, restSec: 12, doneMs: 600, resumeSec: 2, awaitRepeatSec: 6 } : DEFAULTS;
const REST_MIN_MS = (FAST ? 3 : 30) * 1000; // program §4.2: never shorter, also after a change of exercise
const prepFor = (ex, no) => (FAST ? 4 : ex.prep[no > 1 ? 1 : 0]);

// Subtitles and the fallback when a clip did not load. The manifest texts carry a dash, ours do not.
const CLIP_TEXT = {
  p_go: 'Начали!',
  breathe: 'Дыши ровно',
  ten_left: 'Ещё десять секунд',
  five_left: 'Ещё пять секунд, дыши',
  p_three_two_one: 'Три, два, один',
  p_rest: 'Отдыхай',
  p_stop_pain: 'Если больно, сразу остановись',
};
const MARK_LABEL = { yes: 'Да', gap: 'С перерывом', no: 'Нет' };
const END_LABEL = { time: 'по времени', stopped: 'кнопкой «Стоп»', interrupted: 'прерван' };
const SEC_WORDS = { 20: 'Двадцать секунд', 4: 'Четыре секунды' };

const OPTIONS = {
  readClose: ['Да', 'С трудом', 'Нет'],
  readMedium: ['Да', 'С трудом', 'Нет'],
  readFar: ['Да', 'С трудом', 'Нет'],
  clipsSilentPlayback: ['Слышно', 'Не слышно'],
  clipsSilentAmbient: ['Слышно', 'Не слышно'],
  speechSilent: ['Слышно', 'Не слышно'],
  musicPlayback: ['Встала на паузу', 'Играла дальше'],
  musicAmbient: ['Встала на паузу', 'Играла дальше'],
  lockedVoice: ['Звучал', 'Молчал'],
  icsResult: ['Открылся и добавился', 'Открылся, не добавился', 'Не открылся'],
  loop: ['Нравится', 'Скорее да', 'Нет'],
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clockNow = () => ({ mono: performance.now(), wall: Date.now() });

const measure = createMeasure({ fast: FAST });
const sound = new ProbeSound((type, data) => measure.log(type, data));

const ui = {
  exId: EXERCISES[0].id,
  placeId: EXERCISES[0].places[0].id,
  layout: 'auto',
  heard: null,
  soundTried: false,
  watchOnly: false,
  lastEx: null,
  lastHoldEndMono: null,
  farRevealUntil: 0,
  subtitle: { text: '', until: 0 },
  lastDigit: null,
  markEditing: false,
  ready: false,
  ended: false,       // a wellbeing button ended the probe for today
  from: 'intro',      // where «Вернуться к пробе» leads
};
let session = null;
let current = 'intro';
let sayQueue = [];
let subQueue = [];
let wakeLock = null;
let lastTouch = performance.now();
let screenTest = null;

const SCREENS = ['intro', 'safety', 'blocked', 'setup', 'set', 'interrupted', 'rest', 'why', 'pain', 'unwell', 'measure', 'screentest'];

function show(id) {
  if (id === 'measure' && current !== 'measure') ui.from = current;
  for (const s of SCREENS) $(`#${s}`).hidden = s !== id;
  current = id;
  if (id === 'measure') openMeasure();
  // The screen may sleep again where no timer runs.
  if (['intro', 'measure', 'pain', 'unwell', 'blocked', 'safety'].includes(id)) releaseWakeLock();
}

const ex = () => byId(ui.exId);
const place = () => ex().places.find((p) => p.id === ui.placeId) ?? ex().places[0];
const layoutNow = () => (ui.layout === 'auto' ? place().layout : ui.layout);

// ---------------- safety gate ----------------

function safetyOk() {
  const s = loadSafety();
  return s?.version === SAFETY_VERSION && s.ok === true;
}

function blockedLeftMs() {
  try {
    const until = Number(localStorage.getItem(BLOCK_KEY));
    return until > Date.now() ? until - Date.now() : 0;
  } catch {
    return 0;
  }
}

// «Плохо себя чувствую» closes the sets for a day, «Болит» until tomorrow (PLAN §6.5).
function blockUntil(wall) {
  try { localStorage.setItem(BLOCK_KEY, String(wall)); } catch { /* memory only */ }
}

function tomorrowMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function enter() {
  if (blockedLeftMs() > 0) {
    $('#blocked-left').textContent = `Осталось около ${Math.ceil(blockedLeftMs() / 3600000)} ч.`;
    show('blocked');
  } else if (!safetyOk()) {
    showSafety();
  } else {
    ui.watchOnly = false;
    openSetup();
  }
}

function showSafety() {
  const form = $('#safety-form');
  form.querySelectorAll('input').forEach((i) => { i.checked = false; });
  $('#safety-continue').disabled = true;
  form.hidden = false;
  $('#safety-stop').hidden = true;
  show('safety');
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
      $('#safety').scrollTo(0, 0);
    } else {
      ui.watchOnly = false;
      openSetup();
    }
  });
  $('#safety-back').addEventListener('click', () => show('intro'));
  $('#safety-redo').addEventListener('click', showSafety);
  $('#safety-watch').addEventListener('click', () => { ui.watchOnly = true; openSetup(); });
  $('#blocked-watch').addEventListener('click', () => { ui.watchOnly = true; openSetup(); });
}

// ---------------- setup ----------------

function chip(label, on, attrs) {
  const b = document.createElement('button');
  b.className = `chip${on ? ' on' : ''}`;
  b.textContent = label;
  for (const [k, v] of Object.entries(attrs)) b.dataset[k] = v;
  return b;
}

function openSetup() {
  renderSetup();
  show('setup');
  $('#setup').scrollTo(0, 0);
}

function renderSetup() {
  const e = ex();
  const p = place();
  $('#ex-chips').replaceChildren(...EXERCISES.map((x) => chip(x.name, x.id === e.id, { ex: x.id })));
  $('#place-chips').replaceChildren(...e.places.map((x) => chip(x.label, x.id === p.id, { place: x.id })));
  $('#layout-chips').replaceChildren(
    chip(`Авто, ${LAYOUTS[p.layout].toLowerCase()}`, ui.layout === 'auto', { layout: 'auto' }),
    ...Object.entries(LAYOUTS).map(([id, label]) => chip(label, ui.layout === id, { layout: id })),
  );
  $('#place-hint').textContent = p.hint;
  $('#stop-hint').textContent = e.stop;
  $('#orient-hint').hidden = layoutNow() !== 'far';
  const d = deviceInfo();
  $('#dim-warning').hidden = !(d.standalone && d.ios && d.ios < 18.4);
  $('#watch-note').hidden = !ui.watchOnly;
  $$('#mode-chips .chip').forEach((b) => b.classList.toggle('on', b.dataset.mode === sound.mode));
  $('#sound-ask').hidden = ui.heard == null && !ui.soundTried;
  $('#sound-help').hidden = ui.heard !== 'no';
  renderBegin();
}

function restLeftBeforeNextMs() {
  return ui.lastHoldEndMono == null ? 0 : Math.max(0, REST_MIN_MS - (performance.now() - ui.lastHoldEndMono));
}

function renderBegin() {
  const b = $('#begin');
  const wait = restLeftBeforeNextMs();
  b.disabled = ui.heard == null || wait > 0;
  b.textContent = wait > 0 ? `Отдых ещё ${Math.ceil(wait / 1000)} с` : ui.heard == null ? 'Сначала проверь звук' : 'Начинаю';
}

function bindSetup() {
  $('#ex-chips').addEventListener('click', (e) => {
    const id = e.target.closest('[data-ex]')?.dataset.ex;
    if (!id) return;
    ui.exId = id;
    ui.placeId = byId(id).places[0].id;
    ui.layout = 'auto';
    renderSetup();
  });
  $('#place-chips').addEventListener('click', (e) => {
    const id = e.target.closest('[data-place]')?.dataset.place;
    if (!id) return;
    ui.placeId = id;
    ui.layout = 'auto';
    renderSetup();
  });
  $('#layout-chips').addEventListener('click', (e) => {
    const id = e.target.closest('[data-layout]')?.dataset.layout;
    if (!id) return;
    ui.layout = id;
    renderSetup();
  });
  $('#mode-chips').addEventListener('click', (e) => {
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (!mode || mode === sound.mode) return;
    sound.setMode(mode); // inside the tap: the new context is born in this gesture
    measure.log('mode', { mode });
    ui.heard = null;
    ui.soundTried = false;
    renderSetup();
  });
  $('#sound-test').addEventListener('click', () => {
    sound.unlock();
    requestWakeLock(true);
    const t = performance.now();
    sound.beepAt('check', t + 60, 'check');
    const clip = sound.clipAt('p_go', t + 450, 'check');
    // The very first tap may come before the clips are decoded, then speech alone answers.
    setTimeout(() => sound.say('Слышно сигнал?'), clip ? 1300 : 500);
    measure.log('soundcheck', { mode: sound.mode, clip });
    ui.soundTried = true;
    $('#sound-ask').hidden = false;
  });
  $$('[data-heard]').forEach((b) => b.addEventListener('click', () => {
    ui.heard = b.dataset.heard;
    measure.log('soundcheck answer', { heard: ui.heard, mode: sound.mode });
    renderSetup();
  }));
  $('#begin').addEventListener('click', () => {
    if ($('#begin').disabled) return;
    sound.unlock();
    requestWakeLock(true);
    session ??= new ProbeSession(TIMES);
    startSet();
  });
}

// ---------------- a set ----------------

function startSet() {
  const e = ex();
  const p = place();
  const last = session.sets.at(-1);
  const no = (last?.exerciseId === e.id ? last.no : 0) + 1;
  const first = ui.lastEx !== e.id;
  ui.lastEx = e.id;
  ui.ready = false;
  ui.markEditing = false;
  ui.lastDigit = null;
  apply(session.startSet(clockNow(), {
    exerciseId: e.id,
    place: p.label,
    layout: layoutNow(),
    prepSec: prepFor(e, no),
    firstOfExercise: first,
    watchOnly: ui.watchOnly,
  }));
  scheduleSet();
  show('set');
}

// Countdown and hold lines go onto the audio clock at once (platform-v3 П4):
// if the screen goes off in the hold, the clips can still play.
function scheduleSet() {
  const s = session.set;
  const e = byId(s.exerciseId);
  sound.cancel('countdown');
  sayQueue = [];
  subQueue = [];
  const p0 = s.prepStart.mono;
  const h0 = p0 + s.prepSec * 1000;
  for (const c of prepCues(s.prepSec, { firstOfExercise: s.firstOfExercise })) planCue(c, p0, e, s);
  for (const c of holdCues(s.holdSec)) planCue(c, h0, e, s);
}

// After «Продолжить»: «Займи позу», «Три, два, один», then only the hold lines still ahead.
function scheduleResume() {
  const s = session.set;
  const e = byId(s.exerciseId);
  sound.cancel('resume');
  sayQueue = [];
  subQueue = [];
  const now = performance.now();
  const resumeEnd = now + TIMES.resumeSec * 1000;
  sayQueue.push({ at: now, text: 'Займи позу' });
  if (TIMES.resumeSec >= 3) planCue({ at: TIMES.resumeSec - 3, clips: ['p_three_two_one'], ticks: [TIMES.resumeSec - 3, TIMES.resumeSec - 2, TIMES.resumeSec - 1] }, now, e, s);
  // The hold start moved back by the time the page was away; keep it on the safe clock.
  const holdStartMono = now - (s.holdSec * 1000 - session.holdLeftMs(clockNow()));
  for (const c of holdCues(s.holdSec)) {
    if (holdStartMono + c.at * 1000 > resumeEnd + 200) planCue(c, holdStartMono, e, s);
  }
}

function planCue(c, base, e, s) {
  const at = base + c.at * 1000;
  if (c.clips) {
    let t = at;
    for (const id of c.clips) {
      if (!sound.clipAt(id, t, 'set')) sayQueue.push({ at: t, text: CLIP_TEXT[id] });
      else subQueue.push({ at: t, text: CLIP_TEXT[id] });
      t += (sound.clipSec(id) || 1.2) * 1000 + 80;
    }
  }
  for (const sec of c.ticks ?? []) sound.beepAt('tick', base + sec * 1000, 'set');
  if (c.beep) sound.beepAt(c.beep, at, 'set');
  if (c.say) sayQueue.push({ at, text: lineText(c.say, e, s) });
}

function lineText(key, e, s) {
  if (key === 'prep') return FAST ? e.name : `${e.name}. ${SEC_WORDS[s.holdSec] ?? ''}.`;
  if (key === 'cue') return e.cue;
  if (key === 'done') return `Готово! ${e.exit}.`;
  return '';
}

// Speech and subtitles that came due. Speech only on a visible page and only
// if it is fresh: a line that is late by more than 1,5 s is dropped, not stacked.
function runQueues(nowMono) {
  const dueSay = sayQueue.filter((q) => q.at <= nowMono);
  if (dueSay.length) {
    sayQueue = sayQueue.filter((q) => q.at > nowMono);
    const last = dueSay.at(-1);
    if (!document.hidden && nowMono - last.at < 1500) {
      sound.say(last.text);
      setSubtitle(last.text);
    }
  }
  const dueSub = subQueue.filter((q) => q.at <= nowMono);
  if (dueSub.length) {
    subQueue = subQueue.filter((q) => q.at > nowMono);
    setSubtitle(dueSub.at(-1).text);
  }
}

function setSubtitle(text) {
  ui.subtitle = { text, until: performance.now() + 2600 };
}

function sayNow(text) {
  if (document.hidden) return;
  sound.say(text);
  setSubtitle(text);
}

// ---------------- engine events ----------------

function apply(events) {
  let askReason = false;
  for (const ev of events) {
    if (ev.type === 'phase') onPhase(ev.phase);
    else if (ev.type === 'say') sayNow(ev.line === 'mark' ? 'Отметь подход.' : 'Продолжим?');
    else if (ev.type === 'askReason') askReason = true;
    else if (ev.type === 'reschedule') scheduleSet();
  }
  if (askReason) show('why');
}

function clocks() {
  return { mono: performance.now(), wall: Date.now(), audio: sound.time };
}

function recordHoldStart() {
  const s = session.set;
  const c = clocks();
  s.m0 = c;
  measure.holdStart({
    exercise: byId(s.exerciseId).name,
    place: s.place,
    layout: LAYOUTS[s.layout].toLowerCase(),
    plan: s.holdSec,
    watchOnly: s.watchOnly,
    end: null,
  });
}

function recordHoldEnd() {
  const s = session.sets.at(-1);
  if (!s || s.measured || !s.m0) return;
  s.measured = true;
  const c = clocks();
  measure.holdEnd({
    end: true,
    endReason: s.endedHidden ? 'по времени при скрытой странице' : END_LABEL[s.endReason],
    dMono: c.mono - s.m0.mono,
    dWall: c.wall - s.m0.wall,
    dAudio: c.audio != null && s.m0.audio != null ? c.audio - s.m0.audio : null,
    hiddenMs: s.hiddenMs,
    mark: s.mark ? MARK_LABEL[s.mark] : null,
  });
  ui.lastHoldEndMono = performance.now();
}

function onPhase(phase) {
  if (phase === 'prep') {
    show('set');
  } else if (phase === 'hold') {
    recordHoldStart();
  } else if (phase === 'resume') {
    scheduleResume();
    show('set');
  } else if (phase === 'done') {
    recordHoldEnd();
  } else if (phase === 'rest') {
    const s = session.sets.at(-1);
    if (s && s.endReason !== 'time') {
      sound.cancel('set ended');
      sound.stopSpeech();
      sayQueue = [];
      subQueue = [];
    }
    recordHoldEnd();
    show('rest');
    renderRest();
  } else if (phase === 'interrupted') {
    // The schedule is taken off the audio clock; «Продолжить» puts the rest back (platform-v3 §3.9).
    sound.cancel('interrupted');
    sound.stopSpeech();
    sayQueue = [];
    subQueue = [];
    show('interrupted');
  } else if (phase === 'awaitMark') {
    renderRest();
  } else if (phase === 'next') {
    // The next set starts by itself only on the rest screen of a visible page with
    // working sound (platform-v3 §3.3). From the setup screen it waits for «Начинаю».
    if (current === 'rest' && !document.hidden && sound.state === 'running') startSet();
    else {
      ui.ready = true;
      renderRest();
    }
  } else if (phase === 'ready') {
    sound.cancel('countdown stopped');
    sound.stopSpeech();
    openSetup();
  } else if (phase === 'over') {
    sound.cancel('over');
  }
}

function markMeasure(answer) {
  const rec = measure.data.sets.at(-1);
  if (rec && rec.end) {
    rec.mark = MARK_LABEL[answer];
    measure.log('mark', { mark: rec.mark });
  }
}

function wellbeing(kind) {
  // Which button and why stay on the phone (D4, D16): the report only counts them.
  measure.log('wellbeing', {});
  sound.cancel('wellbeing');
  sound.stopSpeech();
  sayQueue = [];
  subQueue = [];
  if (session) {
    session.stop(clockNow());
    recordHoldEnd();
    session.finish();
  }
  ui.ended = true;
  blockUntil(kind === 'unwell' ? Date.now() + 24 * 3600 * 1000 : tomorrowMidnight());
  show(kind === 'pain' ? 'pain' : 'unwell');
}

function bindSet() {
  $('#skip-prep').addEventListener('click', () => {
    requestWakeLock(true);
    apply(session.skipPrep(clockNow()));
  });
  const stop = () => {
    sound.cancel('stop');
    sound.stopSpeech();
    apply(session.stop(clockNow()));
  };
  $('#stop').addEventListener('click', stop);
  $('#far-stop').addEventListener('click', stop);
  $('#set-pain').addEventListener('click', () => wellbeing('pain'));
  $('#far-pain').addEventListener('click', () => wellbeing('pain'));
  // Far away the screen shows only the digit; a first touch brings «Стоп» and «Болит».
  $('#set').addEventListener('pointerdown', (e) => {
    if ($('#set').dataset.layout !== 'far' || e.target.closest('.far-controls')) return;
    ui.farRevealUntil = performance.now() + 5000;
  });
  $('#int-resume').addEventListener('click', () => {
    sound.unlock();
    requestWakeLock(true);
    apply(session.resume(clockNow()));
  });
  $('#int-end').addEventListener('click', () => apply(session.stop(clockNow())));
}

// ---------------- rest ----------------

function renderRest() {
  const s = session?.set;
  if (!s) return;
  const marked = s.mark != null && !ui.markEditing;
  $('#mark-card').hidden = marked;
  $('#marked').hidden = !marked;
  if (marked) $('#marked-text').textContent = `Отмечено «${MARK_LABEL[s.mark]}»`;
  const waiting = session.phase === 'awaitMark';
  const ready = ui.ready || session.phase === 'next';
  $('#await-text').hidden = !waiting;
  $('#rest-digit').hidden = waiting || ready;
  $('#rest-word').hidden = waiting || ready;
  $('#rest-go').hidden = !ready;
  $('#rest-more').disabled = session.phase !== 'rest';
  // Another exercise only after the mark, or the unmarked set would be left behind.
  $('#rest-change').disabled = s.mark == null;
  const e = byId(s.exerciseId);
  $('#rest-next').textContent = waiting ? 'Дальше подход, когда будет отметка' : `Дальше ${e.name.toLowerCase()}, подход ${s.no + 1}, ${s.holdSec} с`;
  $('#rest-note').textContent = s.endedHidden
    ? 'Подход закончился, пока экран был выключен.'
    : s.endReason === 'interrupted' ? 'Подход закрыт по времени, экран выключался.' : '';
}

function bindRest() {
  $$('[data-mark]').forEach((b) => b.addEventListener('click', () => {
    requestWakeLock(true);
    sound.unlock();
    ui.markEditing = false;
    const answer = b.dataset.mark;
    apply(session.mark(answer, clockNow()));
    markMeasure(answer);
    renderRest();
  }));
  $('#mark-change').addEventListener('click', () => {
    ui.markEditing = true;
    renderRest();
  });
  $$('[data-reason]').forEach((b) => b.addEventListener('click', () => {
    session?.reason(b.dataset.reason);
    measure.log('reason', { reason: b.textContent });
    show('rest');
    renderRest();
  }));
  $$('[data-wellbeing]').forEach((b) => b.addEventListener('click', () => wellbeing(b.dataset.wellbeing)));
  $('#rest-more').addEventListener('click', () => {
    session.extendRest(30);
    measure.log('rest', { event: '+30 s' });
  });
  $('#rest-change').addEventListener('click', () => openSetup());
  $('#rest-finish').addEventListener('click', () => {
    sound.cancel('finish');
    session.finish();
    show('measure');
  });
  $('#rest-go').addEventListener('click', () => {
    sound.unlock();
    requestWakeLock(true);
    startSet();
  });
}

// ---------------- drawing ----------------

const RING_C = 2 * Math.PI * 44;

function renderSet(v, s, now) {
  const el = $('#set');
  const e = byId(s.exerciseId);
  el.dataset.layout = s.layout;
  const state = v.phase === 'prep' || v.phase === 'resume' ? 'prep' : v.phase === 'done' ? 'done' : v.left <= 5 ? 'final' : 'hold';
  el.dataset.state = state;

  const digit = $('#digit');
  digit.hidden = state === 'done';
  $('#done-mark').hidden = state !== 'done';
  const shown = String(v.left);
  if (digit.textContent !== shown) {
    digit.textContent = shown;
    if (state === 'final' && ui.lastDigit != null) {
      digit.classList.remove('pulse');
      void digit.offsetWidth; // restart the animation every second
      digit.classList.add('pulse');
    }
    ui.lastDigit = shown;
  }

  const frac = state === 'done' ? 1 : v.total > 0 ? v.leftMs / (v.total * 1000) : 0;
  const ring = $('#ring');
  ring.style.strokeDasharray = `${RING_C}`;
  ring.style.strokeDashoffset = `${RING_C * (1 - Math.max(0, Math.min(1, frac)))}`;

  $('#state-word').textContent = { prep: v.phase === 'resume' ? 'Займи позу' : 'Готовься', hold: 'Держи', final: 'Держи', done: 'Готово' }[state];
  const cue = $('#cue-line');
  cue.textContent = state === 'prep' ? (v.phase === 'resume' ? '' : e.prepText) : state === 'done' ? e.exitText : e.cue;
  cue.style.fontSize = state === 'prep' || state === 'done' ? '17px' : '';
  $('#subtitle').textContent = now.mono < ui.subtitle.until ? ui.subtitle.text : '';
  $('#set-title').textContent = `Подход ${s.no}. ${e.name}${FAST ? ', ускоренно' : ''}`;
  $('#watch-banner').hidden = !s.watchOnly;
  $('#skip-prep').hidden = !(v.phase === 'prep' && v.left > 3);
  $('#stop').hidden = !(v.phase === 'hold' || v.phase === 'resume');
  $('#far-controls').hidden = !(s.layout === 'far' && now.mono < ui.farRevealUntil && ['prep', 'hold', 'resume'].includes(v.phase));
}

function frame() {
  const now = clockNow();
  if (session && !['over', 'idle'].includes(session.phase)) {
    apply(session.tick(now));
    runQueues(now.mono);
    const v = session.view(now);
    if (current === 'set' && session.set) renderSet(v, session.set, now);
    else if (current === 'interrupted') $('#int-digit').textContent = String(v.left);
    else if (current === 'rest' && v.phase === 'rest') $('#rest-digit').textContent = String(v.left);
    // «Через десять секунд готовимся» comes whether the set is marked or not (spec-game-layer-v3 §2.7).
    if (current === 'rest' && session.phase === 'rest' && v.left <= 10 && !session.set.rest10Said) {
      session.set.rest10Said = true;
      if (v.left > 0) sayNow('Через десять секунд готовимся.');
    }
  }
  if (current === 'setup') renderBegin();
  if (current === 'screentest') renderScreenTest(now);
  requestAnimationFrame(frame);
}

// ---------------- screen, visibility, touches ----------------

async function requestWakeLock(inGesture) {
  if (!('wakeLock' in navigator) || document.hidden) return;
  if (wakeLock && !wakeLock.released) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    wakeLock = lock;
    measure.log('wakelock', { event: 'request', ok: true, inGesture });
    lock.addEventListener('release', () => measure.log('wakelock', { event: 'release', hiddenNow: document.hidden }));
  } catch (e) {
    measure.log('wakelock', { event: 'request', ok: false, error: e?.name ?? String(e), inGesture });
  }
}

function releaseWakeLock() {
  if (wakeLock && !wakeLock.released) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function bindPage() {
  addEventListener('pointerdown', () => { lastTouch = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    const now = clockNow();
    if (document.hidden) {
      measure.hidden({
        phase: session?.phase && !['over', 'idle'].includes(session.phase) ? session.phase : current,
        mono: now.mono,
        wall: now.wall,
        audio: sound.time,
        audioBefore: sound.state,
        sinceTouchSec: (now.mono - lastTouch) / 1000,
      });
      session?.hidden(now);
    } else {
      const h = measure.data.hidden.at(-1);
      const fresh = h && h.back == null && h.load === measure.load;
      measure.visible({
        back: now.mono,
        dMono: fresh ? now.mono - h.mono : null,
        dWall: fresh ? now.wall - h.wall : null,
        dAudio: fresh && h.audio != null && sound.time != null ? sound.time - h.audio : null,
        audioAfter: sound.state,
      });
      if (session && !['over', 'idle'].includes(session.phase)) apply(session.visible(now));
      if (['set', 'interrupted', 'rest', 'screentest', 'setup'].includes(current)) requestWakeLock(false);
    }
  });
  addEventListener('pagehide', (e) => measure.log('page', { event: 'pagehide', persisted: e.persisted }));
  addEventListener('pageshow', (e) => measure.log('page', { event: 'pageshow', persisted: e.persisted }));
  // Clocks every 10 s while the sound runs: page, wall and audio side by side.
  setInterval(() => {
    if (!document.hidden && sound.state === 'running') measure.clockSample(sound.time, `${sound.ctxCount}.${sound.runEpoch}`);
  }, 10_000);
}

// ---------------- measure screen ----------------

function renderQuestions() {
  const box = $('#questions');
  box.replaceChildren(...QUESTIONS.map(([key, label]) => {
    const q = document.createElement('div');
    q.className = 'q';
    const p = document.createElement('p');
    p.textContent = label;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const opt of OPTIONS[key]) chips.append(chip(opt, measure.data.answers[key] === opt, { q: key, v: opt }));
    q.append(p, chips);
    return q;
  }));
}

const live = { persisted: null, usage: null, quota: null };

async function openMeasure() {
  renderQuestions();
  $('#phone').value = measure.data.answers.phone ?? '';
  $('#comment').value = measure.data.answers.comment ?? '';
  for (const id of ['batteryBefore', 'batteryAfter', 'batteryMinutes']) $(`#${id}`).value = measure.data.answers[id] ?? '';
  $('#share').hidden = !navigator.share;
  $('#copy-status').textContent = '';
  renderReport();
  try {
    live.persisted = navigator.storage?.persisted ? String(await navigator.storage.persisted()) : 'нет API';
    const est = await navigator.storage?.estimate?.();
    if (est) {
      live.usage = `${Math.round((est.usage ?? 0) / 1024)} КБ`;
      live.quota = `${Math.round((est.quota ?? 0) / 1048576)} МБ`;
    }
  } catch (e) {
    live.persisted = `ошибка ${e?.name}`;
  }
  renderReport();
}

function reportText() {
  return buildReport(measure.data, {
    device: deviceInfo(),
    wakeSupported: 'wakeLock' in navigator,
    sessionApi: sound.hasSessionApi,
    voices: ProbeSound.ruVoices(),
    persisted: live.persisted,
    usage: live.usage,
    quota: live.quota,
    marks: measure.marks(),
  });
}

function renderReport() {
  $('#report').value = reportText();
}

let icsBlobUrl = null;
function icsUrl() {
  icsBlobUrl ??= URL.createObjectURL(new Blob([icsText()], { type: 'text/calendar' }));
  return icsBlobUrl;
}

function icsText() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (![1, 3, 5].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T190000`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plank Run//timer probe//RU', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:probe-${Date.now()}@plank.erg-team.ru`, `DTSTAMP:${stamp}`, `DTSTART:${start}`,
    'DURATION:PT25M', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR', 'SUMMARY:Plank Run\\, тренировка',
    'DESCRIPTION:Проверка напоминания из пробы таймера. Событие можно удалить.',
    'URL:https://plank.erg-team.ru/probe/timer/',
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Plank Run', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

async function copyReport() {
  const text = reportText();
  $('#report').value = text;
  try {
    await navigator.clipboard.writeText(text);
    $('#copy-status').textContent = 'Скопировано. Вставь в чат.';
  } catch {
    const ta = $('#report');
    ta.removeAttribute('readonly');
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.setAttribute('readonly', '');
    $('#copy-status').textContent = ok ? 'Скопировано. Вставь в чат.' : 'Не получилось, выдели текст и скопируй сам.';
  }
}

function bindMeasure() {
  $('#questions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const { q, v } = b.dataset;
    measure.answer(q, measure.data.answers[q] === v ? undefined : v);
    renderQuestions();
    renderReport();
  });
  for (const id of ['phone', 'comment', 'batteryBefore', 'batteryAfter', 'batteryMinutes']) {
    $(`#${id}`).addEventListener('input', (e) => {
      measure.answer(id, e.target.value.trim() || undefined);
      renderReport();
    });
  }
  // Both ways, because iPhone may open the calendar sheet for one and save a file for the other.
  $('#ics-open').addEventListener('click', () => {
    measure.ics('открыть');
    window.open(icsUrl(), '_blank', 'noopener');
    renderReport();
  });
  $('#ics-download').addEventListener('click', () => {
    measure.ics('скачать');
    const a = document.createElement('a');
    a.href = icsUrl();
    a.download = 'plank-run-proba.ics';
    a.click();
    renderReport();
  });
  $('#copy').addEventListener('click', copyReport);
  $('#share').addEventListener('click', () => navigator.share({ text: reportText() }).catch(() => {}));
  $('#measure-back').addEventListener('click', () => {
    if (ui.ended || blockedLeftMs() > 0) show('intro');
    else if (session && ['rest', 'awaitMark', 'next'].includes(session.phase)) show('rest');
    else openSetup();
  });
  $('#measure-reset').addEventListener('click', () => {
    if (!confirm('Стереть замер и начать заново?')) return;
    measure.reset();
    location.reload();
  });
  $('#screentest-go').addEventListener('click', startScreenTest);
  $('#st-end').addEventListener('click', () => endScreenTest('прервано'));
}

// 20 minutes with the screen on: does it stay on, and what it costs in charge.
function startScreenTest() {
  sound.unlock();
  requestWakeLock(true);
  screenTest = { start: clockNow(), totalMs: (FAST ? 0.25 : 20) * 60_000 };
  navigator.getBattery?.().then((b) => measure.battery({ when: 'начало', level: Math.round(b.level * 100) })).catch(() => {});
  measure.log('screentest', { event: 'начало' });
  show('screentest');
}

function renderScreenTest(now) {
  if (!screenTest) return;
  const left = screenTest.totalMs - (now.wall - screenTest.start.wall);
  $('#st-digit').textContent = String(Math.max(0, Math.ceil(left / 60_000)));
  if (left <= 0) {
    sound.beepAt('done', performance.now() + 50, 'screentest');
    sayNow('Двадцать минут прошло.');
    endScreenTest('конец');
  }
}

function endScreenTest(how) {
  if (!screenTest) return;
  const minutes = (Date.now() - screenTest.start.wall) / 60_000;
  measure.log('screentest', { event: how, minutes });
  navigator.getBattery?.().then((b) => measure.battery({ when: how, level: Math.round(b.level * 100) })).catch(() => {});
  screenTest = null;
  show('measure');
}

// ---------------- start ----------------

function boot() {
  bindSafety();
  bindSetup();
  bindSet();
  bindRest();
  bindMeasure();
  bindPage();
  $('#go').addEventListener('click', enter);
  $$('[data-open="measure"]').forEach((b) => b.addEventListener('click', () => show('measure')));
  $('#fast-note').hidden = !FAST;
  sound.load(); // clips are fetched now and decoded on the first tap
  show('intro');
  requestAnimationFrame(frame);
}

boot();
