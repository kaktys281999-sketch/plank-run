// Voice line table — the single source of truth for every spoken prompt.
//
// Shared on purpose: the voice agent (tools/tts) reads this file to render
// assets/voice/<voice>/<lineId>.m4a, and js/voice.js reads it to fall back
// to speechSynthesis(text) when a clip is missing or fails to decode. Keep
// ids stable — they are file names. Texts are short and imperative because
// they are heard from the floor mid-plank, not read.
//
// Plain `export const` object (no imports, no logic) so a Node script can
// `import` it directly or even regex it out.

export const VOICE_LINES = {
  p_welcome: 'Начинаем проверку. Держи только до сигнала. Любой отрезок можно сделать на коленях или пропустить.',
  p_go: 'Начали!',
  p_rest: 'Отдыхай.',
  p_next: 'Следующий отрезок.',
  p_hold_still: 'Встань в планку и держи ровно.',
  p_shift: 'Медленно смещай корпус влево и вправо.',
  p_nod: 'Теперь кивни головой, корпус не двигай.',
  p_sway_beat: 'Качайся влево-вправо в такт щелчкам.',
  p_knees: 'Теперь планка на коленях.',
  p_straight_arms: 'Теперь на прямых руках.',
  p_side_knee: 'Боковая планка на колене. Можно пропустить.',
  p_shoulder_taps: 'Касайся плеч по очереди, шесть раз.',
  p_stand: 'Встань. Отрезок закончен.',
  p_side_flat: 'Держи ровную линию.',
  p_side_sag: 'Чуть опусти таз на три секунды.',
  p_side_pike: 'Подними таз домиком на три секунды.',
  p_side_rock: 'Качнись вперёд и назад.',
  p_stop_pain: 'Если больно — сразу остановись.',
  p_done: 'Проверка закончена. Спасибо!',
  p_three_two_one: 'Три, два, один.',
  breathe: 'Дыши ровно',
};

export const VOICE_LINE_IDS = Object.keys(VOICE_LINES);
