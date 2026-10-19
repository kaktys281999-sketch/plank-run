// Искра — черновые SVG для доски направлений (неделя 1).
// Одна геометрия из арт-библии (docs/plan/spec-visual-art.md §2.2, viewBox 0 0 128 128):
// тело — круг (64, 68) r 36, ореолы r 46 и r 60, хохолок из трёх округлых лопастей,
// глаза-эллипсы 5×8,5 в (52, 66) и (76, 66) с бликом r 2, рот — дуга у (64, 80),
// румянец 7×4, искорки-ладошки r 5 в (24, 76) и (104, 76). Рук и ног нет.
// Три варианта отрисовки — по одному на направление доски:
//   neon   «Огонёк» — свечение, градиент от белого к мятному (направление 1, рекомендация)
//   sport  «Знак»   — плоский лайм, кольцо вместо свечения (направление 2)
//   friend «Дружок» — контур чернилами, светлый фон (направление 3)
// Запуск: node board/mascot/build-mascot.mjs  → пишет board/mascot/<variant>-<mood>.svg
// Это черновик для выбора; канон C4 (14 настроений, 5 разворотов) рисуется после выбора.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

const VARIANTS = {
  neon: {
    name: 'Огонёк', style: 'glow', ink: '#0B0D17', bg: '#0B0D17',
    skin: '#5EF2C2', light: '#C9FFEC', blush: '#FFB3C7', blushA: 0.35,
    ok: '#5EF2C2', warn: '#FFB547', bad: '#FF5D7A', care: '#A397FF', party: '#FFD25E',
    confetti: ['#FFD25E', '#5EF2C2', '#A397FF', '#4CC9FF'],
  },
  sport: {
    name: 'Знак', style: 'ring', ink: '#0A0A0B', bg: '#0A0A0B',
    skin: '#C6FF3D', light: '#EAFFB8', blush: null, blushA: 0,
    ok: '#C6FF3D', warn: '#FFB547', bad: '#FF5A36', care: '#38E1FF', party: '#C6FF3D',
    confetti: ['#C6FF3D', '#38E1FF', '#FFFFFF'],
  },
  friend: {
    name: 'Дружок', style: 'sticker', ink: '#2B2350', bg: '#FFF7EC',
    skin: '#8C7BFF', light: '#CFC6FF', shade: '#6A4BF0', blush: '#FF8FA3', blushA: 0.6,
    ok: '#58D68D', warn: '#FFC83D', bad: '#FF8A65', care: '#FF9EC4', party: '#8C7BFF',
    confetti: ['#58D68D', '#FF9EC4', '#4CC9FF', '#8C7BFF'],
  },
};

const MOODS = {
  idle: 'покой',
  happy: 'радость',
  care: 'забота (после «Болит»)',
  tired: 'устала',
  celebrate: 'праздник',
  ok: 'норма ●',
  worry: 'внимание ▲',
  stop: 'срыв ✕',
};

const r1 = (n) => +n.toFixed(1);

// Капля-искорка: круг r 5 с хвостиком вверх, поворот вокруг центра.
const DROP = 'M0-10C2.8-6 5-3.2 5 0A5 5 0 0 1-5 0C-5-3.2-2.8-6 0-10Z';
function spark(v, x, y, rot, scale = 1, edge = null) {
  const s = scale === 1 ? '' : ` scale(${scale})`;
  const ec = edge || (v.style === 'sticker' ? v.ink : null);
  const stroke = ec ? ` stroke="${ec}" stroke-width="${r1(2.4 / scale)}" stroke-linejoin="round"` : '';
  if (v.style === 'ring') {
    // спорт: искорки — плотные точки без хвоста
    return `<circle cx="${x}" cy="${y}" r="${r1(4.5 * scale)}" fill="${v.light}"${ec ? ` stroke="${ec}" stroke-width="2.4"` : ''}/>`;
  }
  return `<path d="${DROP}" transform="translate(${x} ${y}) rotate(${rot})${s}" fill="${v.light}"${stroke}/>`;
}

// «Искорка у сердца» для care: маленькое сердце, которое Искра прижимает к груди.
function heart(v, x, y) {
  const edge = v.style === 'sticker' ? ` stroke="${v.ink}" stroke-width="1.8" stroke-linejoin="round"` : '';
  const fill = v.style === 'glow' ? v.light : v.care;
  const ring = v.style === 'glow' ? ` stroke="${v.care}" stroke-width="1.6" stroke-linejoin="round"` : edge;
  return `<path d="M0 4.6C-7.4-.6-5.6-8.4 0-4.8 5.6-8.4 7.4-.6 0 4.6Z" transform="translate(${x} ${y}) scale(1.15)" fill="${fill}"${ring}/>`;
}

function halo(v, id, color, k = 1, full = false) {
  if (v.style === 'glow') {
    return `<defs><radialGradient id="${id}a" cx="64" cy="68" r="60" gradientUnits="userSpaceOnUse"><stop offset=".5" stop-color="${color}" stop-opacity="${r1(0.12 * k * 100) / 100}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${id}b" cx="64" cy="68" r="46" gradientUnits="userSpaceOnUse"><stop offset=".72" stop-color="${color}" stop-opacity="${r1(0.45 * k * 100) / 100}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>` +
      `<g class="ik-halo"><circle cx="64" cy="68" r="60" fill="url(#${id}a)"/><circle cx="64" cy="68" r="46" fill="url(#${id}b)"/></g>`;
  }
  if (v.style === 'ring') {
    // кольцо как у таймера HUD: 9 % диаметра, незамкнутое в покое, полное в празднике
    const c = 2 * Math.PI * 46;
    const dash = full ? '' : ` stroke-dasharray="${r1(c * 0.78)} ${r1(c)}"`;
    return `<g class="ik-halo"><circle cx="64" cy="68" r="58" fill="none" stroke="${color}" stroke-opacity="${r1(0.22 * k)}" stroke-width="1.5"/>` +
      `<circle cx="64" cy="68" r="46" fill="none" stroke="${color}" stroke-opacity="${Math.min(1, r1(k))}" stroke-width="5" stroke-linecap="round" transform="rotate(-90 64 68)"${dash}/></g>`;
  }
  // sticker: мягкий плоский ореол-диск
  return `<g class="ik-halo"><circle cx="64" cy="68" r="56" fill="${color}" fill-opacity="${r1(0.16 * k)}"/><circle cx="64" cy="68" r="46" fill="${color}" fill-opacity="${r1(0.32 * k)}"/></g>`;
}

function tuft(v) {
  if (v.style === 'ring') {
    return `<g fill="${v.light}"><circle cx="55" cy="27" r="4"/><circle cx="64" cy="22" r="4.6"/><circle cx="73" cy="27" r="4"/></g>`;
  }
  const lobes = (attrs) =>
    `<g ${attrs}><ellipse cx="57" cy="32" rx="4.6" ry="6.6" transform="rotate(-26 57 32)"/><ellipse cx="64" cy="25.5" rx="5.2" ry="8"/><ellipse cx="71" cy="32" rx="4.6" ry="6.6" transform="rotate(26 71 32)"/></g>`;
  if (v.style === 'sticker') {
    return lobes(`fill="${v.ink}" stroke="${v.ink}" stroke-width="6"`) + lobes(`fill="${v.light}"`);
  }
  return lobes(`fill="${v.light}"`);
}

function body(v, id) {
  if (v.style === 'glow') {
    return `<defs><radialGradient id="${id}c" cx="64" cy="68" r="38" fx="52" fy="56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".42" stop-color="${v.light}"/><stop offset="1" stop-color="${v.skin}"/></radialGradient></defs>` +
      `<circle cx="64" cy="68" r="36" fill="url(#${id}c)"/>`;
  }
  if (v.style === 'ring') {
    return `<circle cx="64" cy="68" r="36" fill="${v.skin}"/><ellipse cx="50" cy="52" rx="6" ry="3.6" transform="rotate(-38 50 52)" fill="#fff" fill-opacity=".6"/>`;
  }
  return `<defs><clipPath id="${id}k"><circle cx="64" cy="68" r="36"/></clipPath></defs>` +
    `<circle cx="64" cy="68" r="36" fill="${v.shade}"/><circle cx="58.5" cy="62.5" r="35" fill="${v.skin}" clip-path="url(#${id}k)"/>` +
    `<ellipse cx="49" cy="51" rx="7.5" ry="4.2" transform="rotate(-38 49 51)" fill="#fff" fill-opacity=".7"/>` +
    `<circle cx="64" cy="68" r="36" fill="none" stroke="${v.ink}" stroke-width="3"/>`;
}

// ---- лицо ----
function eyes(v, kind) {
  const ink = v.ink;
  const big = v.style === 'sticker';
  const L = big ? [51, 65] : [52, 66];
  const R = big ? [77, 65] : [76, 66];
  const rx = big ? 6 : v.style === 'ring' ? 4.4 : 5;
  const ry = big ? 9.5 : 8.5;
  const hl = (x, y, r) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#fff"/>`;
  const hlR = v.style === 'ring' ? 1.5 : big ? 2.6 : 2;
  const open = (sy = 1, wide = 1) => {
    const out = [L, R].map(([x, y]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${r1(rx * wide)}" ry="${r1(ry * sy)}" fill="${ink}"/>` +
      hl(x - rx * 0.36 * wide, y - ry * sy * 0.45, hlR) + (big ? hl(x + 2, y + 4, 1.2) : '')).join('');
    return `<g class="ik-eyes">${out}</g>`;
  };
  const arcs = () => {
    const w = big ? 6.5 : 5.5;
    return `<g class="ik-eyes" fill="none" stroke="${ink}" stroke-width="${big ? 3.6 : 3.2}" stroke-linecap="round">` +
      [L, R].map(([x, y]) => `<path d="M${x - w} ${y + 3}Q${x} ${y - 8} ${x + w} ${y + 3}"/>`).join('') + '</g>';
  };
  switch (kind) {
    case 'happy': return arcs();
    case 'half': {
      const out = [L, R].map(([x, y]) =>
        `<path d="M${r1(x - rx)} ${y}a${rx} ${r1(ry * 0.8)} 0 0 0 ${r1(rx * 2)} 0Z" fill="${ink}"/>` +
        `<path d="M${r1(x - rx - 1.5)} ${y - 0.6}L${r1(x + rx + 1.5)} ${y + 0.8}" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`).join('');
      return `<g class="ik-eyes">${out}</g>`;
    }
    case 'soft': return open(0.86);
    case 'wide': return open(1.06, 1.22);
    default: return open();
  }
}

function brows(v, kind) {
  if (!kind) return '';
  const big = v.style === 'sticker';
  const lx = big ? 51 : 52, rx = big ? 77 : 76;
  const y = big ? 51 : 53;
  const d = kind === 'worry'
    ? [`M${lx - 6.5} ${y + 3}Q${lx} ${y + 2} ${lx + 5} ${y - 2}`, `M${rx + 6.5} ${y + 3}Q${rx} ${y + 2} ${rx - 5} ${y - 2}`]
    : [`M${lx - 6} ${y + 1}Q${lx} ${y - 1} ${lx + 5} ${y - 1.5}`, `M${rx + 6} ${y + 1}Q${rx} ${y - 1} ${rx - 5} ${y - 1.5}`];
  return `<g fill="none" stroke="${v.ink}" stroke-width="2.5" stroke-linecap="round">${d.map((p) => `<path d="${p}"/>`).join('')}</g>`;
}

function mouth(v, kind) {
  const ink = v.ink;
  const line = (d) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (kind) {
    case 'open': return `<path d="M57 77.5Q64 88 71 77.5Z" fill="${ink}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="64" cy="81" rx="3" ry="1.5" fill="#FF7FA0"/>`;
    case 'big': return `<path d="M55.5 76.5Q64 92 72.5 76.5Z" fill="${ink}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="64" cy="82.5" rx="4" ry="2" fill="#FF7FA0"/>`;
    case 'soft': return line('M60 80Q64 82.6 68 80');
    case 'wavy': return line('M58 81Q61 79 64 81T70 81');
    case 'frown': return line('M59.5 81.5Q64 78.6 68.5 81.5');
    case 'o': return `<ellipse cx="64" cy="81" rx="3.2" ry="4" fill="${ink}"/>`;
    default: return line('M59 79Q64 83.5 69 79');
  }
}

function blush(v, a) {
  if (!v.blush || !a) return '';
  return `<g fill="${v.blush}" fill-opacity="${a}"><ellipse cx="45" cy="77" rx="7" ry="4"/><ellipse cx="83" cy="77" rx="7" ry="4"/></g>`;
}

// ---- знаки состояний (форма дублирует цвет: при дейтеранопии мятный и янтарный сливаются) ----
function badge(v, kind) {
  const edge = v.bg;
  if (kind === 'ok') {
    return `<g class="ik-badge"><circle cx="106" cy="107" r="10" fill="${v.ok}" stroke="${edge}" stroke-width="3"/></g>`;
  }
  if (kind === 'warn') {
    return `<g class="ik-badge"><path d="M106 94.5L118.5 117H93.5Z" fill="${v.warn}" stroke="${edge}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M106 102.5V109.5" stroke="${v.ink}" stroke-width="2.6" stroke-linecap="round"/><circle cx="106" cy="113.4" r="1.6" fill="${v.ink}"/></g>`;
  }
  return `<g class="ik-badge"><circle cx="106" cy="107" r="11" fill="${v.bad}" stroke="${edge}" stroke-width="3"/>` +
    `<path d="M101.5 102.5L110.5 111.5M110.5 102.5L101.5 111.5" stroke="${v.ink}" stroke-width="3" stroke-linecap="round"/></g>`;
}

function confetti(v) {
  let out = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2 + 0.26;
    const rr = i % 2 ? 54 : 59;
    const x = 64 + Math.cos(a) * rr, y = 66 + Math.sin(a) * rr;
    out += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${i % 3 ? 2 : 2.8}" fill="${v.confetti[i % v.confetti.length]}"/>`;
  }
  return `<g class="ik-fx">${out}</g>`;
}

// ---- сборка одного настроения ----
function build(vk, mood) {
  const v = VARIANTS[vk];
  const id = `${vk[0]}${mood.slice(0, 3)}`;
  let haloColor = v.skin, k = 1, full = false;
  let eyeKind = 'open', browKind = null, mouthKind = 'smile', blushA = v.blushA;
  let sparks = [[24, 76, -20], [104, 76, 20]];
  let tf = '', fx = '', bdg = '', front = '';

  switch (mood) {
    case 'happy':
      k = 1.2; eyeKind = 'happy'; mouthKind = 'open'; blushA = v.blushA ? v.blushA + 0.2 : 0;
      sparks = [[21, 60, -38], [107, 60, 38]];
      tf = 'translate(64 104) scale(.98 1.03) translate(-64 -104)';
      break;
    case 'care':
      haloColor = v.care; eyeKind = 'soft'; browKind = 'care'; mouthKind = 'soft';
      sparks = [[24, 80, -15]];
      front = heart(v, 76, 93);
      break;
    case 'tired':
      k = 0.7; eyeKind = 'half'; mouthKind = 'wavy'; blushA = v.blushA ? v.blushA * 0.5 : 0;
      sparks = [[27, 94, 195], [101, 94, 165]];
      tf = 'translate(64 104) scale(1.07 .9) translate(-64 -104)';
      fx = `<path d="M93 43c0 0 4.5 5.2 4.5 8a4.5 4.5 0 0 1-9 0c0-2.8 4.5-8 4.5-8Z" fill="#A8E1FF"${v.style === 'sticker' ? ` stroke="${v.ink}" stroke-width="2"` : ''}/>`;
      break;
    case 'celebrate':
      haloColor = v.party; k = 1.25; full = true; eyeKind = 'happy'; mouthKind = 'big'; blushA = v.blushA ? v.blushA + 0.2 : 0;
      sparks = [[25, 36, -32], [103, 36, 32]];
      tf = 'translate(0 -3) translate(64 104) scale(.97 1.04) translate(-64 -104)';
      fx = confetti(v);
      break;
    case 'ok':
      haloColor = v.ok; bdg = badge(v, 'ok');
      break;
    case 'worry':
      haloColor = v.warn; eyeKind = 'soft'; browKind = 'worry'; mouthKind = 'frown';
      sparks = [[27, 70, -8], [101, 70, 8]];
      tf = 'translate(64 68) scale(.95) translate(-64 -68)';
      bdg = badge(v, 'warn');
      break;
    case 'stop':
      haloColor = v.bad; eyeKind = 'wide'; mouthKind = 'o'; blushA = 0;
      sparks = [[24, 80, -20]];
      // правая искорка выходит вперёд и растёт — жест «стоп» ладошкой
      front = spark(v, 93, 88, 0, 1.7, v.style === 'sticker' ? v.ink : v.bad);
      bdg = badge(v, 'stop');
      break;
    default:
      break;
  }

  const sparkG = `<g class="ik-sparks">${sparks.map(([x, y, a]) => spark(v, x, y, a)).join('')}</g>`;
  const face = eyes(v, eyeKind) + brows(v, browKind) + mouth(v, mouthKind) + blush(v, blushA);
  const inner = `${tuft(v)}${body(v, id)}<g class="ik-face">${face}</g>${front}`;
  const bodyG = `<g class="ik-body"${tf ? ` transform="${tf}"` : ''}>${inner}</g>`;
  const title = `Искра «${v.name}»: ${MOODS[mood]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" class="iskra iskra--${vk} iskra--${mood}"><title>${title}</title>` +
    `${halo(v, id, haloColor, k, full)}${fx}${sparkG}${bodyG}${bdg}</svg>\n`;
}

const sizes = [];
for (const vk of Object.keys(VARIANTS)) {
  for (const mood of Object.keys(MOODS)) {
    const svg = build(vk, mood);
    const file = join(OUT, `${vk}-${mood}.svg`);
    writeFileSync(file, svg);
    sizes.push([`${vk}-${mood}.svg`, Buffer.byteLength(svg)]);
  }
}
for (const [f, b] of sizes) console.log(f.padEnd(24), b, 'B');
const max = Math.max(...sizes.map(([, b]) => b));
console.log('max', max, 'B', max < 6144 ? 'OK (< 6 KB)' : 'TOO BIG');
