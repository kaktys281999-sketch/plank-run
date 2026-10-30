// What the timer probe measures (platform-v3 §3.11). Kept in memory and in
// sessionStorage, so a reload of the tab does not lose it, and shown as text
// the owner copies and sends on by hand. The page sends nothing anywhere (D27).
// Health answers stay out: the report says only that a wellbeing button was used.

export const PROBE_VERSION = 1;
const KEY = 'plank-run:probe-timer:measure';
const MARKS = 'plank-run:probe-timer:marks';
const MAX_EVENTS = 600;

const store = {
  get(k, area = sessionStorage) {
    try { return JSON.parse(area.getItem(k)); } catch { return null; }
  },
  set(k, v, area = sessionStorage) {
    try { area.setItem(k, JSON.stringify(v)); } catch { /* private mode: memory only */ }
  },
};

export function deviceInfo() {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return {
    ua,
    ios: ios ? Number(`${ios[1]}.${ios[2]}`) : null,
    iosText: ios ? `${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ''}` : null,
    android: android ? android[1] : null,
    standalone,
    screen: `${innerWidth}×${innerHeight}, экран ${screen.width}×${screen.height}, dpr ${devicePixelRatio}`,
  };
}

export function createMeasure({ fast }) {
  const saved = store.get(KEY);
  const m = saved?.version === PROBE_VERSION ? saved : {
    version: PROBE_VERSION,
    startedWall: Date.now(),
    fast,
    loads: 0,
    events: [],
    sets: [],
    clock: [],
    hidden: [],
    answers: {},
    ics: [],
    battery: [],
  };
  m.loads += 1;
  const load = m.loads;
  const t0 = { mono: performance.now(), wall: Date.now() };
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, m), 500);
  };

  // Which of the two homes of the page has run here: a Safari tab and the app
  // on the home screen keep separate storage on iPhone (research/v3 W2).
  const ctx = deviceInfo().standalone ? 'приложение' : 'вкладка';
  const marks = store.get(MARKS, localStorage) ?? [];
  marks.unshift({ ctx, wall: Date.now() });
  store.set(MARKS, marks.slice(0, 10), localStorage);

  const api = {
    data: m,
    load,
    log(type, data = {}) {
      m.events.push({ load, mono: Math.round(performance.now()), wall: Date.now(), type, ...data });
      if (m.events.length > MAX_EVENTS) m.events.splice(0, m.events.length - MAX_EVENTS);
      save();
    },
    // Clocks every 10 s: page, wall and audio, with the id of the audio context.
    clockSample(audioTime, audioId) {
      m.clock.push({ load, audioId, mono: performance.now(), wall: Date.now(), audio: audioTime });
      if (m.clock.length > 400) m.clock.splice(0, 100);
      save();
    },
    holdStart(rec) {
      m.sets.push({ load, ...rec });
      save();
    },
    holdEnd(rec) {
      const last = m.sets.at(-1);
      if (last && last.end == null) Object.assign(last, rec);
      save();
    },
    hidden(rec) {
      m.hidden.push({ load, ...rec });
      save();
    },
    visible(rec) {
      const last = m.hidden.at(-1);
      if (last && last.back == null) Object.assign(last, rec);
      save();
    },
    answer(key, value) {
      m.answers[key] = value;
      save();
    },
    ics(how) {
      m.ics.push({ how, wall: Date.now() });
      save();
    },
    battery(rec) {
      m.battery.push(rec);
      save();
    },
    marks: () => marks,
    sinceLoadMs: () => performance.now() - t0.mono,
    reset() {
      store.set(KEY, null);
    },
  };
  api.log('load', { ctx, reloadedFromSession: Boolean(saved) && load > 1 });
  return api;
}

const n1 = (x) => (x == null || Number.isNaN(x) ? 'нет' : (Math.round(x * 10) / 10).toString().replace('.', ','));
const n0 = (x) => (x == null || Number.isNaN(x) ? 'нет' : Math.round(x).toString());
const hm = (wall) => {
  const d = new Date(wall);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

// The text the owner copies. Short lines «what = value», readable in a chat.
export function buildReport(m, live) {
  const L = [];
  const d = live.device;
  L.push(`Проба таймера Plank Run, замер v${m.version}`);
  L.push(`Начато ${hm(m.startedWall)}, сейчас ${hm(Date.now())}, загрузок страницы ${m.loads}`);
  if (m.fast) L.push('УСКОРЕННЫЙ РЕЖИМ, числа для пробы не годятся');
  L.push(`Модель со слов = ${m.answers.phone || 'не указана'}`);
  L.push(`Система = ${d.iosText ? `iOS ${d.iosText}` : d.android ? `Android ${d.android}` : 'не определена'}, открыто ${d.standalone ? 'с экрана «Домой»' : 'во вкладке браузера'}`);
  L.push(`Экран = ${d.screen}`);
  L.push(`Браузер = ${d.ua}`);

  L.push('', 'Подходы');
  if (!m.sets.length) L.push('нет');
  m.sets.forEach((s, i) => {
    const parts = [`${i + 1}. ${s.exercise}, ${s.place}, раскладка ${s.layout}, план ${s.plan} с`];
    if (s.end != null) {
      parts.push(`конец ${s.endReason}`);
      parts.push(`часы страницы ${n1(s.dMono / 1000)} с, стенные ${n1(s.dWall / 1000)} с, звука ${s.dAudio == null ? 'нет' : `${n1(s.dAudio)} с`}`);
      if (s.hiddenMs) parts.push(`страница скрыта ${n1(s.hiddenMs / 1000)} с`);
      parts.push(`отметка ${s.mark ?? 'нет'}`);
      if (s.watchOnly) parts.push('без упражнения');
    } else parts.push('не закончен');
    L.push(parts.join(', '));
  });

  // Drift of the clocks over each stretch with one page load and one audio context.
  L.push('', 'Часы за сессию');
  const groups = new Map();
  for (const c of m.clock) {
    if (c.audio == null) continue;
    const k = `${c.load}/${c.audioId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  let span = 0, worstAudio = 0, worstWall = 0;
  for (const list of groups.values()) {
    const a = list[0];
    for (const c of list) {
      const dm = c.mono - a.mono;
      worstAudio = Math.max(worstAudio, Math.abs((c.audio - a.audio) * 1000 - dm));
      worstWall = Math.max(worstWall, Math.abs((c.wall - a.wall) - dm));
      span = Math.max(span, dm);
    }
  }
  L.push(groups.size
    ? `Самый длинный отрезок ${n1(span / 60000)} мин. Звук против страницы до ${n0(worstAudio)} мс, стенные против страницы до ${n0(worstWall)} мс`
    : 'нет данных, звук не включали');

  L.push('', 'Скрытия страницы');
  if (!m.hidden.length) L.push('не было');
  m.hidden.forEach((h, i) => {
    const parts = [`${i + 1}. в фазе ${h.phase}`];
    if (h.sinceTouchSec != null) parts.push(`без касаний до этого ${n0(h.sinceTouchSec)} с`);
    if (h.back != null) {
      parts.push(`скрыта по стенным ${n1(h.dWall / 1000)} с, по часам страницы ${n1(h.dMono / 1000)} с`);
      parts.push(h.dAudio == null ? 'звук не создан' : `часы звука прошли ${n1(h.dAudio)} с`);
      parts.push(`звук ${h.audioBefore} потом ${h.audioAfter}`);
    } else parts.push('не вернулась');
    L.push(parts.join(', '));
  });

  const ev = (type) => m.events.filter((e) => e.type === type);
  L.push('', 'Экран');
  const wl = ev('wakelock');
  L.push(`Wake Lock = ${live.wakeSupported ? 'есть' : 'нет'}`);
  for (const w of wl.slice(-12)) {
    L.push(`  ${n1((w.mono) / 1000)} с загрузки ${w.load}, ${w.event}${w.ok != null ? (w.ok ? ' ok' : ` ошибка ${w.error}`) : ''}${w.inGesture != null ? (w.inGesture ? ', в касании' : ', без касания') : ''}${w.hiddenNow ? ', страница скрыта' : ''}`);
  }

  L.push('', 'Звук');
  L.push(`audioSession = ${live.sessionApi ? 'есть' : 'нет'}`);
  for (const a of ev('audio').slice(-16)) {
    const { load, mono, wall, type, ...rest } = a;
    L.push(`  ${n1(mono / 1000)} с загрузки ${load}, ${Object.entries(rest).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  const clips = ev('clip');
  const played = clips.filter((c) => !c.cancelled);
  const whileHidden = played.filter((c) => m.hidden.some((h) => h.load === c.load && c.plannedMono >= h.mono && h.back != null && c.plannedMono <= h.back));
  L.push(`Клипов доиграно ${played.length}, снято ${clips.length - played.length}, из доигранных по плану при скрытой странице ${whileHidden.length}`);
  L.push(`Синтез, русские голоса = ${live.voices == null ? 'синтеза нет' : live.voices.length ? live.voices.map((v) => `${v.name} (${v.lang}${v.local ? ', на телефоне' : ', сеть'})`).join('; ') : 'нет'}`);

  L.push('', 'Хранилище');
  L.push(`persisted = ${live.persisted ?? 'нет данных'}, занято ${live.usage ?? 'нет данных'} из ${live.quota ?? 'нет данных'}`);
  L.push(`Метки запусков = ${live.marks.map((x) => `${x.ctx} ${hm(x.wall)}`).join('; ')}`);

  L.push('', 'Календарь');
  L.push(m.ics.length ? `Нажато ${m.ics.map((x) => x.how).join(', ')}` : 'не проверяли');

  L.push('', 'Заряд');
  const a = m.answers;
  if (m.battery.length) L.push(`Автоматически ${m.battery.map((b) => `${b.when} ${b.level} %`).join(', ')}`);
  L.push(`Со слов = до ${a.batteryBefore || 'нет'}, после ${a.batteryAfter || 'нет'}, минут ${a.batteryMinutes || 'нет'}`);
  const screenTests = ev('screentest');
  if (screenTests.length) L.push(`Тест экрана = ${screenTests.map((e) => `${e.event}${e.minutes != null ? ` ${n1(e.minutes)} мин` : ''}`).join(', ')}`);

  L.push('', 'Ответы');
  for (const [k, label] of QUESTIONS) L.push(`${label} = ${a[k] ?? 'нет ответа'}`);
  const wellbeing = m.events.filter((e) => e.type === 'wellbeing').length;
  if (wellbeing) L.push(`Кнопки самочувствия нажимались ${wellbeing} раз`);
  if (a.comment) L.push(`Комментарий = ${a.comment}`);
  return L.join('\n');
}

// The owner's own answers on the measure screen, in the order of the report.
export const QUESTIONS = [
  ['readClose', 'Цифры близко читаются'],
  ['readMedium', 'Цифры средне читаются'],
  ['readFar', 'Цифры далеко читаются'],
  ['clipsSilentPlayback', 'Клипы при «Без звука», режим «Тренер слышен всегда»'],
  ['clipsSilentAmbient', 'Клипы при «Без звука», режим «Слушаю свою музыку»'],
  ['speechSilent', 'Синтез телефона при «Без звука»'],
  ['musicPlayback', 'Своя музыка в режиме «Тренер слышен всегда»'],
  ['musicAmbient', 'Своя музыка в режиме «Слушаю свою музыку»'],
  ['lockedVoice', 'Голос при заблокированном телефоне посреди подхода'],
  ['icsResult', 'Файл календаря'],
  ['loop', 'Петля «отсчёт, держи, отдых»'],
];
