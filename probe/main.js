// Plank Run look probe (spec-visual-v2 §9, PLAN §12.0 step 1).
// A throwaway page. The new app is written from scratch at Ф0; the assets and the owner's answers
// (does the look hold, which hero, does the run read from the floor, how many frames) stay.
//
// URL flags: ?hero=mage  ?seed=7  ?shot=pick|run|arena (a still frame without UI for the
// backdrop prompts, add &ui to keep the interface for a layout check).

import * as THREE from 'three';
import { World } from './world.js';
import { Assets } from './assets.js';
import { HEROES, KEEPER_FILE, Actor } from './hero.js';
import { Run, RUN_SECONDS } from './run.js';
import { Perf } from './perf.js';
import { CameraProbe } from './camera.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const seed = Number(params.get('seed') ?? (SHOT ? 7 : Date.now() % 1e9));
const rng = mulberry32(seed);

const $ = (s) => document.querySelector(s);
const store = {
  get(key, fallback) {
    try { return localStorage.getItem(`plank-probe.${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`plank-probe.${key}`, value); } catch { /* private mode */ }
  },
};

// Side by side for a portrait screen: the keeper behind on the left, the hero in front on the right.
const ARENA_HERO = { x: 1.05, z: 1.3, rot: -0.3 };
const ARENA_KEEPER = { x: -1.35, z: -1.6, rot: 0.18, scale: 1.7 };

let world;
let assets;
let run;
let hero = null;
let keeper;
let heroToken = 0;
let mode = 'loading';
let turn = null;
let lastNow = 0;
let lastUi = 0;
let tauntIn = 4;
let resting = false;
let wake = null;
let hintTimer = 0;
const actors = new Map();
const perf = new Perf();
const cam = new CameraProbe($('#cam'));
const settings = {
  hero: Math.max(0, HEROES.findIndex((h) => h.id === (params.get('hero') ?? store.get('hero', 'knight')))),
  outfit: store.get('outfit', 'plain'),
  shadows: store.get('shadows', 'on'),
  dpr: Number(store.get('dpr', '2')),
};

// Read by the screenshot scripts in a script browser; the page itself never uses it.
window.__probe = {
  get mode() { return mode; },
  get lane() { return run?.lane; },
  get stars() { return run?.starsTaken; },
  get hero() { return heroDef().id; },
};

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (v, digits = 0) => v.toFixed(digits).replace('.', ',');

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

function fade(on) {
  const el = $('#fade');
  el.classList.toggle('on', on);
  return new Promise((resolve) => setTimeout(resolve, 320));
}

async function keepAwake(on) {
  try {
    if (on && !wake) wake = await navigator.wakeLock?.request('screen');
    if (!on && wake) {
      await wake.release();
      wake = null;
    }
  } catch { /* not allowed here, the run is short anyway */ }
}

// ---------------- hero ----------------

function heroDef() {
  return HEROES[settings.hero];
}

function heroFile() {
  const def = heroDef();
  return def.outfits?.find((o) => o.id === settings.outfit)?.file ?? def.file;
}

async function setHero() {
  const token = ++heroToken;
  const root = await assets.loadCharacter(heroFile());
  if (token !== heroToken) return;
  if (hero) world.scene.remove(hero.root);
  if (!actors.has(root)) actors.set(root, new Actor(root, assets.clips));
  hero = actors.get(root);
  world.scene.add(root);
  if (mode === 'pick') {
    placeForPick();
    hero.once('Waving', { fade: 0.2, then: 'Idle_A' });
  }
}

function placeForPick() {
  hero.root.position.set(0, 0, 0);
  hero.root.rotation.y = 0.35;
  world.blob.position.set(0, world.blob.position.y, 0);
}

function renderPickUi() {
  const def = heroDef();
  $('#hero-name').textContent = def.name;
  const chips = $('#hero-chips');
  chips.replaceChildren(...HEROES.map((h, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === settings.hero ? ' on' : '');
    b.textContent = h.name;
    b.addEventListener('click', () => chooseHero(i));
    return b;
  }));
  const outfits = $('#outfit-chips');
  outfits.hidden = !def.outfits;
  outfits.replaceChildren(...(def.outfits ?? []).map((o) => {
    const b = document.createElement('button');
    b.className = 'chip' + (o.id === settings.outfit ? ' on' : '');
    b.textContent = o.name;
    b.addEventListener('click', () => {
      settings.outfit = o.id;
      store.set('outfit', o.id);
      renderPickUi();
      setHero();
    });
    return b;
  }));
}

function chooseHero(i) {
  settings.hero = (i + HEROES.length) % HEROES.length;
  store.set('hero', heroDef().id);
  renderPickUi();
  setHero();
}

// ---------------- modes ----------------

function enterPick() {
  mode = 'pick';
  resting = false;
  $('#dim').classList.remove('on');
  world.showRun();
  run.reset();
  world.followX = 0;
  world.setPose('pick');
  if (hero) {
    placeForPick();
    hero.loop('Idle_A', 0.2);
  }
  renderPickUi();
  show('pick');
}

function startRun(bot, { instant = false } = {}) {
  mode = 'run';
  resting = false;
  $('#dim').classList.remove('on');
  world.showRun();
  run.start({ bot, actor: hero });
  hero.root.position.set(0, 0, 0);
  world.blob.position.set(0, world.blob.position.y, 0);
  if (instant) {
    world.setPose('run');
    hero.root.rotation.y = Math.PI;
    turn = null;
  } else {
    world.setPose('run', 0.8);
    turn = { from: hero.root.rotation.y, to: Math.PI, t: 0, duration: 0.45 };
  }
  hero.loop('Running_A', 0.2);
  $('#star-count').textContent = '0';
  $('#time-fill').style.width = '0%';
  const hint = $('#hint');
  hint.textContent = bot ? 'Положи телефон на пол и посмотри с 0,7 и 1,5 м' : 'Смахни влево или вправо';
  hint.classList.add('on');
  // A new run restarts the timer, so the previous run's timer cannot hide this hint early.
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('on'), bot ? 5000 : 2500);
  show('hud');
  perf.startRun();
  keepAwake(true);
}

async function finishRun() {
  mode = 'finish';
  const stats = perf.stopRun();
  const camera = cam.snapshot();
  keepAwake(false);
  await fade(true);
  enterArena();
  renderResult(stats, camera);
  show('result');
  await fade(false);
}

function enterArena() {
  mode = 'arena';
  world.showArena();
  world.followX = 0;
  world.setPose('arena');
  hero.root.position.set(ARENA_HERO.x, 0, ARENA_HERO.z);
  hero.root.rotation.y = ARENA_HERO.rot;
  world.blob.position.set(ARENA_HERO.x, world.blob.position.y, ARENA_HERO.z);
  hero.loop('Cheering', 0.1);
  keeper.loop('Skeletons_Idle', 0);
  tauntIn = 3;
  $('#rest').textContent = 'Отдых';
}

function renderResult(stats, camera) {
  const rows = [
    ['Звёзды', String(run.starsTaken)],
    ['Задето камней', String(run.rocksHit)],
    ['Кадры', stats.frames ? `${num(stats.fps)} к/с, ${num(stats.avgMs, 1)} мс` : 'нет данных'],
    ['Худшие 5% кадров', stats.frames ? `${num(stats.p95Ms)} мс` : 'нет данных'],
    ['Камера', camera.on ? `вкл, ${num(camera.rate)} в секунду` : 'выкл'],
  ];
  fillStats($('#stats'), rows);
}

function fillStats(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    return [dt, dd];
  }));
}

async function again() {
  await fade(true);
  startRun(run.bot, { instant: true });
  await fade(false);
}

async function toPick() {
  await fade(true);
  enterPick();
  await fade(false);
}

function toggleRest() {
  resting = !resting;
  if (resting) hero.once('Sit_Floor_Down', { fade: 0.2, then: 'Sit_Floor_Idle' });
  else hero.once('Sit_Floor_StandUp', { fade: 0.15, then: 'Cheering' });
  $('#dim').classList.toggle('on', resting);
  $('#rest').textContent = resting ? 'Встать' : 'Отдых';
}

// ---------------- frame ----------------

function step(dt) {
  if (mode === 'run') {
    run.update(dt);
    $('#star-count').textContent = String(run.starsTaken);
    $('#time-fill').style.width = `${Math.min(100, (run.t / RUN_SECONDS) * 100)}%`;
    if (run.done) finishRun();
  }
  if (turn) {
    turn.t = Math.min(1, turn.t + dt / turn.duration);
    hero.root.rotation.y = THREE.MathUtils.lerp(turn.from, turn.to, 1 - Math.pow(1 - turn.t, 3));
    if (turn.t >= 1) turn = null;
  }
  if (mode === 'arena' && !resting) {
    tauntIn -= dt;
    if (tauntIn <= 0) {
      keeper.once('Skeletons_Taunt', { fade: 0.2 });
      tauntIn = 5 + rng() * 3;
    }
  }
  hero?.update(dt);
  if (world.arenaGroup.visible) keeper.update(dt);
  world.update(dt);
}

function frame(now) {
  perf.tick(now);
  // The page-weight meter (WOW_LAB zamer.mjs) waits for this mark: canvas is invisible to LCP.
  if (!frame.marked && mode === 'pick') {
    frame.marked = true;
    requestAnimationFrame(() => performance.mark('wow:scene'));
  }
  const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
  lastNow = now;
  step(dt);
  world.render();
  if (now - lastUi > 500) {
    lastUi = now;
    updatePerfUi();
  }
}

function updatePerfUi() {
  const r = perf.recent();
  $('#perf').textContent = `${num(r.fps)} к/с`;
  if ($('#measure').hidden) return;
  const c = cam.snapshot();
  const size = world.renderer.getDrawingBufferSize(new THREE.Vector2());
  fillStats($('#live'), [
    ['Кадры', `${num(r.fps)} к/с, ${num(r.avgMs, 1)} мс`],
    ['Худшие 5% кадров', `${num(r.p95Ms)} мс`],
    ['Распознавание', c.on ? `${num(c.rate)} в секунду, ${num(c.ms, 1)} мс, ${c.face ? 'лицо видно' : 'лица нет'}` : 'выкл'],
    ['Картинка', `${size.x} × ${size.y}`],
    ['Видеокарта', gpuName()],
  ]);
}

function gpuName() {
  const gl = world.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

// ---------------- measure panel ----------------

function renderMeasure() {
  for (const [id, value] of [['#seg-shadows', settings.shadows], ['#seg-dpr', String(settings.dpr)]]) {
    for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === value);
  }
  $('#cam-toggle').textContent = cam.on ? 'Выключить' : 'Включить';
  $('#cam').hidden = !cam.on;
}

function applySettings() {
  world.setShadows(settings.shadows === 'on');
  world.setDprCap(settings.dpr);
}

function bindMeasure() {
  $('#perf').addEventListener('click', () => {
    $('#measure').hidden = !$('#measure').hidden;
    renderMeasure();
    updatePerfUi();
  });
  $('#measure-close').addEventListener('click', () => { $('#measure').hidden = true; });
  const seg = (id, key, parse = String) => {
    $(id).addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (!v) return;
      settings[key] = parse(v);
      store.set(key, v);
      applySettings();
      renderMeasure();
    });
  };
  seg('#seg-shadows', 'shadows');
  seg('#seg-dpr', 'dpr', Number);
  $('#cam-toggle').addEventListener('click', async () => {
    const note = $('#cam-note');
    if (cam.on) {
      cam.stop();
      note.textContent = 'Сядь перед телефоном, чтобы лицо было в кадре. Это замер, а не игра.';
      renderMeasure();
      return;
    }
    $('#cam-toggle').disabled = true;
    $('#cam').hidden = false;
    try {
      await cam.start((s) => { note.textContent = s; });
      note.textContent = 'Камера и распознавание работают. Кадры ниже уже с ними.';
    } catch (err) {
      note.textContent = err.message;
    } finally {
      $('#cam-toggle').disabled = false;
      renderMeasure();
    }
  });
}

// ---------------- input ----------------

function bindInput() {
  $('#prev').addEventListener('click', () => chooseHero(settings.hero - 1));
  $('#next').addEventListener('click', () => chooseHero(settings.hero + 1));
  $('#go-self').addEventListener('click', () => startRun(false));
  $('#go-bot').addEventListener('click', () => startRun(true));
  $('#again').addEventListener('click', again);
  $('#to-pick').addEventListener('click', toPick);
  $('#rest').addEventListener('click', toggleRest);

  // A swipe or a tap on either half of the screen moves one lane.
  let down = null;
  const hud = $('#hud');
  hud.addEventListener('pointerdown', (e) => { down = { x: e.clientX }; });
  hud.addEventListener('pointerup', (e) => {
    if (!down || mode !== 'run' || run.bot) return;
    const dx = e.clientX - down.x;
    run.move(Math.abs(dx) > 28 ? Math.sign(dx) : e.clientX < window.innerWidth / 2 ? -1 : 1);
    down = null;
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'run' || run.bot) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') run.move(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') run.move(1);
  });
  window.addEventListener('resize', () => world.resize());
}

// ---------------- screenshots ----------------

function simulate(seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) step(dt);
}

async function prepareShot() {
  document.body.classList.toggle('shot', !params.has('ui'));
  if (SHOT === 'pick') {
    hero.pose('Idle_A', 0.3);
  } else if (SHOT === 'run') {
    startRun(true);
    simulate(6.4);
    // A star caught mid-pop is a half-transparent smudge in a still frame; the prompts get none.
    for (const s of run.stars) if (s.taken) run.free(s);
  } else if (SHOT === 'arena') {
    startRun(true);
    simulate(RUN_SECONDS - 0.5);
    mode = 'finish';
    enterArena();
    renderResult(perf.stopRun(), cam.snapshot());
    show('result');
    simulate(0.6);
    hero.pose('Cheering', 0.55);
    keeper.pose('Skeletons_Idle', 1.2);
  }
  $('#fade').classList.remove('on');
  world.update(0);
  world.render();
  world.renderer.setAnimationLoop(null);
  document.documentElement.dataset.ready = SHOT;
}

// ---------------- boot ----------------

async function boot() {
  try {
    world = new World($('#scene'), rng);
  } catch (err) {
    $('#load-text').textContent = 'Этот браузер не запускает 3D. Проба тут не заработает.';
    console.error(err);
    return;
  }
  world.resize();
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    $('#load-fill').style.width = `${Math.round((loaded / total) * 100)}%`;
  };
  assets = new Assets(manager);
  const [starTexture] = await Promise.all([assets.loadStarTexture(), assets.loadForest(), assets.loadClips()]);
  world.buildForest(assets);
  world.buildArena(assets);
  run = new Run(world, assets, starTexture, rng);
  const keeperRoot = await assets.loadCharacter(KEEPER_FILE);
  keeper = new Actor(keeperRoot, assets.clips);
  keeperRoot.position.set(ARENA_KEEPER.x, 0, ARENA_KEEPER.z);
  keeperRoot.rotation.y = ARENA_KEEPER.rot;
  keeperRoot.scale.setScalar(ARENA_KEEPER.scale);
  world.arenaGroup.add(keeperRoot);
  mode = 'pick';
  await setHero();
  applySettings();
  bindInput();
  bindMeasure();
  renderPickUi();
  show('pick');
  if (SHOT) {
    await prepareShot();
    return;
  }
  world.renderer.setAnimationLoop(frame);
  // The other heroes load in the background, so switching feels instant.
  setTimeout(() => HEROES.forEach((h) => assets.loadCharacter(h.file)), 1500);
}

boot().catch((err) => {
  console.error(err);
  $('#load-text').textContent = `Не загрузилось. ${err.message}`;
  show('loading');
});
