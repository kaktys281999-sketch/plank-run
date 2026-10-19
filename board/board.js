// Доска направлений: «Мне нравится», копирование промптов и выбора, состояния макетов, живые SVG Искры.
// Всё локально: localStorage (если доступен) и файлы рядом со страницей.
(() => {
  'use strict';

  const KEY = 'plank-run-board-v1';
  const DIRS = { 1: '«Неон + Искра»', 2: '«Чистый спорт»', 3: '«Дружелюбный маскот»' };
  const ISKRA = { 1: 'вариант 1 «Огонёк»', 2: 'вариант 2 «Знак»', 3: 'вариант 3 «Дружок»', mix: 'смешать (см. «почему»)' };
  const MODEL = {
    pro: 'Gemini — все картинки Nano Banana Pro',
    mixed: 'Gemini — часть картинок уже обычный Nano Banana (после лимита)',
    unknown: 'Gemini — не понял, какая модель',
    none: 'Gemini не использовал',
  };
  const CHATGPT = { yes: 'ChatGPT — делал картинки', limit: 'ChatGPT — упёрся в лимит', no: 'ChatGPT не использовал' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- хранилище (может быть недоступно: приватный режим, превью) ----------
  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') return data;
    } catch (e) { /* без сохранения */ }
    return {};
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* без сохранения */ }
  }
  const state = Object.assign({ likes: [], main: '', iskra: '', model: '', chatgpt: '', why: '' }, load());
  if (!Array.isArray(state.likes)) state.likes = [];

  // ---------- уведомление ----------
  const toast = $('#toast');
  let toastTimer = 0;
  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ---------- копирование: Clipboard API → execCommand → выделить всё ----------
  function selectAll(el) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  async function copyFrom(el, button) {
    const text = el.textContent;
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) {
      selectAll(el);
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    }
    if (ok) {
      if (button) {
        const label = button.dataset.label || button.textContent;
        button.dataset.label = label;
        button.textContent = 'Скопировано ✓';
        button.classList.add('done');
        setTimeout(() => { button.textContent = label; button.classList.remove('done'); }, 2000);
      }
      say('Скопировано — вставь в чат');
    } else {
      selectAll(el);
      el.focus({ preventScroll: true });
      say('Текст выделен — нажми «Копировать» (Ctrl+C или долгое нажатие)');
    }
  }
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-copy]');
    if (!btn) return;
    const el = document.getElementById(btn.dataset.copy);
    if (el) copyFrom(el, btn);
  });

  // ---------- состояния макетов ● ▲ ✕ ----------
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.states button[data-phone]');
    if (!btn) return;
    const phone = document.getElementById(btn.dataset.phone);
    if (!phone) return;
    phone.dataset.state = btn.dataset.state;
    $$('button', btn.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });

  // ---------- «Мне нравится» ----------
  function renderLikes() {
    $$('.like[data-like]').forEach((b) => b.setAttribute('aria-pressed', String(state.likes.includes(b.dataset.like))));
    $$('#vote-form input[name="like"]').forEach((i) => { i.checked = state.likes.includes(i.value); });
  }
  function setLike(id, on) {
    const set = new Set(state.likes);
    if (on) set.add(id); else set.delete(id);
    state.likes = Array.from(set).sort();
    save(); renderLikes(); renderSummary();
  }
  $$('.like[data-like]').forEach((b) => {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      setLike(b.dataset.like, on);
      say(on ? `Направление ${b.dataset.like}: нравится` : `Направление ${b.dataset.like}: отметка снята`);
    });
  });

  // ---------- форма выбора ----------
  const form = $('#vote-form');
  function fillForm() {
    if (!form) return;
    $$('input[name="main"]', form).forEach((i) => { i.checked = i.value === state.main; });
    $$('input[name="iskra"]', form).forEach((i) => { i.checked = i.value === state.iskra; });
    form.elements.model.value = state.model || '';
    form.elements.chatgpt.value = state.chatgpt || '';
    form.elements.why.value = state.why || '';
  }
  if (form) {
    form.addEventListener('submit', (ev) => ev.preventDefault());
    form.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.name === 'like') { setLike(t.value, t.checked); return; }
      if (t.name === 'main' || t.name === 'iskra') state[t.name] = t.value;
      if (t.name === 'model' || t.name === 'chatgpt' || t.name === 'why') state[t.name] = t.value;
      save(); renderSummary();
    });
  }
  const reset = $('#reset');
  if (reset) {
    reset.addEventListener('click', () => {
      if (!window.confirm('Сбросить отметки и текст выбора?')) return;
      Object.assign(state, { likes: [], main: '', iskra: '', model: '', chatgpt: '', why: '' });
      save(); fillForm(); renderLikes(); renderSummary();
    });
  }

  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  function renderSummary() {
    const out = $('#summary');
    if (!out) return;
    const likes = state.likes.length ? state.likes.map((id) => `${id} ${DIRS[id]}`).join(', ') : '— не отмечено';
    const lines = [
      `Plank Run · доска направлений · ${today()}`,
      `Нравятся: ${likes}`,
      `Главный выбор: ${state.main ? `${state.main} ${DIRS[state.main]}` : '— не выбран'}`,
      `Искра: ${state.iskra ? ISKRA[state.iskra] : '— не выбрана'}`,
      `Почему: ${state.why.trim() || '—'}`,
      `Картинки: ${[MODEL[state.model], CHATGPT[state.chatgpt]].filter(Boolean).join('; ') || '—'}`,
    ];
    out.textContent = lines.join('\n');
  }

  // ---------- живые SVG Искры (моргание, искры). Без JS или по file:// остаются картинки ----------
  async function inlineMascots() {
    const imgs = $$('.mgrid img[data-inline]');
    if (!imgs.length || !window.fetch || !window.DOMParser || location.protocol === 'file:') return;
    const parser = new DOMParser();
    await Promise.all(imgs.map(async (img) => {
      try {
        const res = await fetch(img.getAttribute('src'), { credentials: 'same-origin' });
        if (!res.ok) return;
        const doc = parser.parseFromString(await res.text(), 'image/svg+xml');
        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return;
        $$('script, foreignObject', svg).forEach((n) => n.remove());
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', img.alt || '');
        img.replaceWith(document.importNode(svg, true));
      } catch (e) { /* остаётся <img> */ }
    }));
  }

  renderLikes();
  fillForm();
  renderSummary();
  inlineMascots();
})();
