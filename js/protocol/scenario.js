// The Stage 0 test script (plan §12.1, "?protocol в v0.1.1", item 4), as data.
//
// Every segment: intro (voice + text) → calibration → 3-2-1 → hold → rest.
// Times are in seconds at real speed; the runner scales them in ?protocol&fast
// (tests only) — except the beat, whose 40 BPM is the measurement itself.
//
// Fields:
//  hold    — seconds from "Начали!" to the stop signal. Never above HOLD_MAX.
//  rest    — seconds of rest after the segment (15–20, plan).
//  steady  — a "ровный" segment: its pauses count toward false pauses / min.
//  steer   — 'x' | 'y': the control axis whose range we measure here.
//  knees   — done on the knees by design.
//  optional— the voice says it can be skipped.
//  back    — loads the lower back on purpose; dropped when the user has back pain.
//  warn    — an extra line after the intro.
//  beat    — "Качнись в такт": click train for body latency.
//  cues    — prompts during the hold: at (s from "Начали!"), line, and the
//            pause they are expected to cause (expect: issue ids or 'any', for: s).
//            endOnPause ends the hold as soon as that expected pause arrives.

export const HOLD_MAX = 20;
export const PROTOCOL_VERSION = 1;

// 12 clicks at 40 BPM = one side per click, 1.5 s apart (plan §12.1, spec-rhythm §6.2).
export const BEAT = { clicks: 12, bpm: 40, lead: 2, tail: 1.5 };
export const beatInterval = (beat) => 60 / beat.bpm;
export const beatHold = (beat) => beat.lead + (beat.clicks - 1) * beatInterval(beat) + beat.tail;
// Click times in seconds from "Начали!".
export const beatTimes = (beat) => Array.from({ length: beat.clicks }, (_, i) => beat.lead + i * beatInterval(beat));

const STAND = {
  id: 'stand',
  title: 'Встать',
  line: 'p_hold_still',
  hint: 'Ещё раз ровная планка. По сигналу «Встань» — встань или просто опустись на колени.',
  hold: 11,
  rest: 0,
  // The one place where a pause is the goal: how fast does the app notice?
  cues: [{ at: 5, line: 'p_stand', expect: 'any', for: 6, endOnPause: true }],
};

export const FRONT = [
  {
    id: 'steady',
    title: 'Ровно',
    line: 'p_hold_still',
    hint: 'Ровная планка на предплечьях. Смотри на экран глазами, шея — продолжение спины.',
    hold: 20,
    rest: 15,
    steady: true,
  },
  {
    id: 'shift',
    title: 'Сдвиги влево-вправо',
    line: 'p_shift',
    hint: 'Медленно смещай весь корпус влево и вправо — точка на шкале должна доходить до краёв.',
    hold: 20,
    rest: 15,
    steer: 'x',
  },
  {
    id: 'nod',
    title: 'Кивок без корпуса',
    line: 'p_nod',
    hint: 'Кивай головой вверх-вниз, а плечи и таз держи на месте.',
    hold: 12,
    rest: 15,
  },
  {
    id: 'sway',
    title: 'Качнись в такт',
    line: 'p_sway_beat',
    hint: 'На каждый щелчок — в другую сторону: первый щелчок влево, второй вправо, и так 12 раз.',
    hold: beatHold(BEAT),
    rest: 20,
    steer: 'x',
    beat: BEAT,
  },
  {
    id: 'knees',
    title: 'На коленях',
    line: 'p_knees',
    hint: 'Планка с колен: от плеч до колен — прямая линия.',
    hold: 15,
    rest: 15,
    steady: true,
    knees: true,
  },
  {
    id: 'straight_arms',
    title: 'На прямых руках',
    line: 'p_straight_arms',
    hint: 'Упор на прямых руках, ладони под плечами. Можно с колен.',
    hold: 15,
    rest: 20,
    steady: true,
  },
  {
    id: 'side_knee',
    title: 'Боковая на колене',
    line: 'p_side_knee',
    hint: 'Боковая планка с опорой на колено и предплечье, лицом к экрану. Можно пропустить.',
    hold: 10,
    rest: 20,
    optional: true,
    knees: true,
  },
  {
    id: 'shoulder_taps',
    title: 'Касания плеч ×6',
    line: 'p_shoulder_taps',
    hint: 'На прямых руках: по очереди коснись ладонью противоположного плеча, шесть касаний. Таз не раскачивай.',
    hold: 14,
    rest: 15,
  },
  STAND,
];

export const SIDE = [
  {
    id: 'side_flat',
    title: 'Ровно',
    line: 'p_side_flat',
    hint: 'Ровная планка боком к камере, всё тело в кадре.',
    hold: 15,
    rest: 15,
    steady: true,
  },
  {
    id: 'side_sag',
    title: 'Провис на 3 с',
    line: 'p_hold_still',
    warn: 'p_stop_pain',
    hint: 'Сначала ровно. По сигналу чуть опусти таз на три секунды, потом снова ровная линия.',
    hold: 12,
    rest: 15,
    back: true,
    cues: [
      { at: 4, line: 'p_side_sag', expect: ['sag'], for: 3 },
      { at: 7, line: 'p_side_flat' },
    ],
  },
  {
    id: 'side_pike',
    title: '«Домик» на 3 с',
    line: 'p_hold_still',
    warn: 'p_stop_pain',
    hint: 'Сначала ровно. По сигналу подними таз «домиком» на три секунды, потом снова ровно.',
    hold: 12,
    rest: 15,
    back: true,
    cues: [
      { at: 4, line: 'p_side_pike', expect: ['pike'], for: 3 },
      { at: 7, line: 'p_side_flat' },
    ],
  },
  {
    id: 'side_rock',
    title: 'Качание',
    line: 'p_side_rock',
    hint: 'Плавно качайся вперёд (плечи за ладони) и назад — точка на шкале должна доходить до краёв.',
    hold: 15,
    rest: 15,
    steer: 'y',
  },
  STAND,
];

// The list for this run. backPain drops the segments that load the lower back
// on purpose (sag, pike): plan §12.1 and review-safety-facts (д).
export function buildScenario(camera, { backPain = false } = {}) {
  const list = (camera === 'side' ? SIDE : FRONT).filter((s) => !(backPain && s.back));
  for (const s of list) {
    if (s.hold > HOLD_MAX) throw new Error(`segment ${s.id}: hold ${s.hold} s > ${HOLD_MAX} s`);
  }
  return list;
}

// Plain-data copy for the export file (titles, timing, flags; no functions).
export function describeScenario(list) {
  return list.map(({ id, title, hold, rest, steady, steer, knees, optional, back, beat, cues }) => ({
    id, title, hold, rest,
    ...(steady && { steady }),
    ...(steer && { steer }),
    ...(knees && { knees }),
    ...(optional && { optional }),
    ...(back && { back }),
    ...(beat && { beat }),
    ...(cues && { cues }),
  }));
}
