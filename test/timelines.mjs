// Scripted "workouts" with known ground truth. Each segment: [seconds, params, label].
// front: shift > 0 = moves to the user's LEFT. side: rock > 0 = forward.
export const FPS = 15;
const LOOK = 30;
export const TIMELINES = {
  front: [
    [2, { stand: true }, 'stand'],
    [6, { look: LOOK }, 'neutral'],
    [2.5, { look: LOOK, shift: 6 }, 'left'],
    [2.5, { look: LOOK, shift: -6 }, 'right'],
    [2, { look: LOOK }, 'neutral'],
    [2.5, { look: LOOK, drop: 0.3 }, 'drop'],
    [3, { look: LOOK }, 'neutral'],
    [2, { stand: true }, 'stand'],
    [4, { look: LOOK }, 'neutral'],
  ],
  side: [
    [2, { stand: true }, 'stand'],
    [6, {}, 'neutral'],
    [2.5, { rock: 0.07 }, 'forward'],
    [2.5, { rock: -0.07 }, 'back'],
    [2, {}, 'neutral'],
    [3, { sag: 18 }, 'sag'],
    [2.5, {}, 'neutral'],
    [3, { pike: 25 }, 'pike'],
    [3, {}, 'neutral'],
  ],
};

export const duration = (tl) => tl.reduce((a, [d]) => a + d, 0);

export function segmentAt(tl, t) {
  t %= duration(tl);
  let start = 0;
  for (const seg of tl) {
    if (t < start + seg[0]) return { label: seg[2], start, end: start + seg[0], params: seg[1] };
    start += seg[0];
  }
  return { label: tl.at(-1)[2], start, end: start, params: tl.at(-1)[1] };
}

// Smooth 0.4 s ramps between segments (people don't teleport).
export function paramsAt(tl, t) {
  const seg = segmentAt(tl, t);
  const ramp = 0.4;
  const prev = t - seg.start < ramp ? segmentAt(tl, Math.max(0, seg.start - 0.001)) : null;
  if (!prev || prev.start === seg.start || prev.params.stand || seg.params.stand) return { ...seg.params };
  const k = (t - seg.start) / ramp;
  const keys = new Set([...Object.keys(prev.params), ...Object.keys(seg.params)]);
  const out = {};
  for (const key of keys) out[key] = (prev.params[key] ?? 0) * (1 - k) + (seg.params[key] ?? 0) * k;
  return out;
}
