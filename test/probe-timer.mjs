// Engine of the timer probe (probe/timer/engine.js) on a fake clock.
// Run: node test/probe-timer.mjs. No browser, no network.
//
// What must hold whatever happens to the page: a hold never lasts longer than
// its plan by real time (PLAN D2, platform-v3 П6), the countdown is not part of
// the hold, the rest is never shorter than planned, and without a mark the next
// set does not start (program §5.4).

import assert from 'node:assert/strict';
import { ProbeSession, holdCues, prepCues, elapsedMs } from '../probe/timer/engine.js';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  }
}

// A fake pair of clocks. `sleep` moves only the wall clock, like a phone whose
// monotonic page clock stood still while the screen was off.
function clock(start = 1_000_000) {
  const c = { mono: 0, wall: start };
  return {
    now: () => ({ mono: c.mono, wall: c.wall }),
    add: (ms) => { c.mono += ms; c.wall += ms; },
    sleep: (ms) => { c.wall += ms; },
    wallJump: (ms) => { c.wall += ms; },
  };
}

const plan = (over = {}) => ({ exerciseId: 'stul', place: 'hands', layout: 'close', prepSec: 10, firstOfExercise: true, ...over });

// Ticks in small steps, collecting events, like animation frames.
function run(s, c, ms, step = 50) {
  const ev = [];
  for (let t = 0; t < ms; t += step) {
    c.add(Math.min(step, ms - t));
    ev.push(...s.tick(c.now()));
  }
  return ev;
}

test('20 s hold lines follow program §11.2', () => {
  const got = holdCues(20).map((c) => [c.at, (c.clips ?? []).join('+') || c.say || c.beep]);
  assert.deepEqual(got, [
    [0, 'p_go'],
    [5, 'cue'],
    [10, 'ten_left+breathe'],
    [15, 'five_left'],
    [17, 'p_three_two_one'],
    [20, 'done'],
    [21.8, 'p_rest'],
  ]);
});

test('45 s hold keeps «дыши» at every 10 s mark', () => {
  const at = holdCues(45);
  for (const s of [10, 20, 30]) assert.ok(at.some((c) => c.at === s && c.clips?.includes('breathe')), `breathe at ${s}`);
  assert.ok(at.some((c) => c.at === 35 && c.clips?.join() === 'ten_left,breathe'));
  assert.ok(at.some((c) => c.at === 40 && c.clips?.join() === 'five_left'));
});

test('countdown lines end with «Три, два, один» on the hold start', () => {
  const c = prepCues(10, { firstOfExercise: true });
  assert.deepEqual(c.map((x) => x.at), [0, 3, 7]);
  assert.deepEqual(prepCues(8, { firstOfExercise: false }).map((x) => x.at), [0, 5]);
  const pain = prepCues(8, { firstOfExercise: true }).find((x) => x.clips?.[0] === 'p_stop_pain');
  assert.ok(pain.at + 2.11 <= 8 - 3, '«Если больно» ends before «Три, два, один»');
});

test('a plain set: countdown, hold, done, rest, next', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 9_950);
  assert.equal(s.phase, 'prep');
  run(s, c, 100);
  assert.equal(s.phase, 'hold');
  assert.equal(s.view(c.now()).left, 20);
  run(s, c, 19_900);
  assert.equal(s.phase, 'hold', 'the countdown is not part of the hold');
  run(s, c, 50);
  assert.equal(s.phase, 'done');
  assert.equal(ProbeSession.holdRealMs(s.sets[0]), 20_000);
  run(s, c, 1_600);
  assert.equal(s.phase, 'rest');
  s.mark('yes', c.now());
  run(s, c, 57_000);
  assert.equal(s.phase, 'rest');
  const ev = run(s, c, 1_500);
  assert.equal(s.phase, 'next');
  assert.ok(ev.some((e) => e.phase === 'next'));
});

test('no mark: the rest ends in «Отметь подход», then «Продолжим?», and waits', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 10_000 + 20_000 + 60_000 + 100);
  assert.equal(s.phase, 'awaitMark');
  let ev = run(s, c, 59_000);
  assert.ok(!ev.some((e) => e.line === 'continue'));
  ev = run(s, c, 1_200);
  assert.ok(ev.some((e) => e.line === 'continue'));
  ev = run(s, c, 120_000);
  assert.equal(s.phase, 'awaitMark', 'still waiting, no next set without a mark');
  assert.ok(!ev.some((e) => e.line === 'continue'), '«Продолжим?» only once');
  ev = s.mark('gap', c.now());
  assert.equal(s.phase, 'next');
});

test('screen off mid-hold, monotonic clock asleep: back with 5 s or less closes the set', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 10_000 + 3_000);
  assert.equal(s.phase, 'hold');
  s.hidden(c.now());
  c.sleep(12_500);
  const ev = s.visible(c.now());
  assert.equal(s.phase, 'rest');
  assert.ok(ev.some((e) => e.phase === 'rest'));
  assert.equal(s.sets[0].endReason, 'interrupted');
  assert.ok(ProbeSession.holdRealMs(s.sets[0]) <= 20_000);
});

test('screen off past the plan: closed at the planned second, no celebration', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 12_000);
  s.hidden(c.now());
  c.sleep(60_000);
  s.visible(c.now());
  assert.equal(s.phase, 'rest');
  assert.equal(s.sets[0].endedHidden, true);
  assert.equal(ProbeSession.holdRealMs(s.sets[0]), 20_000);
});

test('screen off briefly: interrupted with a live remainder, then resume inside it', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 10_000 + 2_000);
  s.hidden(c.now());
  c.sleep(6_000);
  s.visible(c.now());
  assert.equal(s.phase, 'interrupted');
  assert.equal(s.view(c.now()).left, 12);
  run(s, c, 1_000);
  assert.equal(s.view(c.now()).left, 11, 'the remainder keeps falling on the interrupted screen');
  s.resume(c.now());
  assert.equal(s.phase, 'resume');
  run(s, c, 5_000);
  assert.equal(s.phase, 'hold');
  run(s, c, 6_000);
  assert.equal(s.phase, 'done');
  assert.equal(ProbeSession.holdRealMs(s.sets[0]), 20_000);
});

test('interrupted screen left alone closes the set at 5 s left', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 11_000);
  s.hidden(c.now());
  c.add(1_000);
  s.visible(c.now());
  assert.equal(s.phase, 'interrupted');
  run(s, c, 14_000);
  assert.equal(s.phase, 'rest');
  assert.equal(s.sets[0].endReason, 'interrupted');
  assert.ok(ProbeSession.holdRealMs(s.sets[0]) <= 15_100);
});

test('wall clock set back during a hold: the monotonic clock still counts', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 15_000);
  c.wallJump(-3_600_000);
  run(s, c, 15_000);
  assert.equal(s.phase, 'done');
  assert.ok(elapsedMs(s.sets[0].holdStart, s.sets[0].holdEnd) <= 20_000);
});

test('«Стоп» in the hold is the answer «Нет» and asks why', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 10_000 + 7_000);
  const ev = s.stop(c.now());
  assert.equal(s.phase, 'rest');
  assert.equal(s.set.mark, 'no');
  assert.ok(ev.some((e) => e.type === 'askReason'));
  assert.equal(s.sets[0].endReason, 'stopped');
  assert.ok(Math.abs(ProbeSession.holdRealMs(s.sets[0]) - 7_000) <= 50);
});

test('«Стоп» in the countdown records no set', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 4_000);
  s.stop(c.now());
  assert.equal(s.phase, 'ready');
  assert.equal(s.sets.length, 0);
});

test('«Начинаю» in the countdown jumps to the last 3 s, not past them', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan({ prepSec: 15 }));
  run(s, c, 2_000);
  s.skipPrep(c.now());
  assert.equal(s.view(c.now()).left, 3);
  run(s, c, 2_900);
  assert.equal(s.phase, 'prep');
  run(s, c, 200);
  assert.equal(s.phase, 'hold');
});

test('a countdown interrupted by a hidden page starts again', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 6_000);
  s.hidden(c.now());
  c.add(4_000);
  s.visible(c.now());
  assert.equal(s.phase, 'prep');
  assert.equal(s.view(c.now()).left, 10);
});

test('the rest can grow, never shrink', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 10_000 + 20_000 + 2_000);
  const before = s.view(c.now()).left;
  s.extendRest(-30);
  assert.equal(s.view(c.now()).left, before);
  s.extendRest(30);
  assert.equal(s.view(c.now()).left, before + 30);
});

test('set numbers count per exercise, a stopped countdown does not count', () => {
  const c = clock();
  const s = new ProbeSession();
  s.startSet(c.now(), plan());
  run(s, c, 31_600);
  s.mark('yes', c.now());
  run(s, c, 60_000);
  s.startSet(c.now(), plan({ firstOfExercise: false }));
  assert.equal(s.set.no, 2);
  s.stop(c.now());
  s.startSet(c.now(), plan({ firstOfExercise: false }));
  assert.equal(s.set.no, 2);
  s.startSet(c.now(), plan({ exerciseId: 'plank' }));
  assert.equal(s.set.no, 1);
});

// Random walks over frames, hidden pages, sleeping clocks, stops and resumes.
// Whatever the order, no finished hold is longer than its plan by real time.
test('random sequences never hold longer than the plan', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 400; round++) {
    const c = clock();
    const s = new ProbeSession();
    s.startSet(c.now(), plan({ prepSec: [8, 10, 15][round % 3] }));
    for (let step = 0; step < 120 && s.phase !== 'next'; step++) {
      const r = rnd();
      if (r < 0.55) run(s, c, 100 + Math.floor(rnd() * 900));
      else if (r < 0.7) { s.hidden(c.now()); (rnd() < 0.5 ? c.sleep : c.add)(Math.floor(rnd() * 15_000)); s.visible(c.now()); }
      else if (r < 0.75) s.resume(c.now());
      else if (r < 0.78) s.stop(c.now());
      else if (r < 0.85) s.mark(['yes', 'gap', 'no'][Math.floor(rnd() * 3)], c.now());
      else if (r < 0.88) s.skipPrep(c.now());
      else if (s.phase === 'ready') s.startSet(c.now(), plan({ firstOfExercise: false }));
      for (const done of s.sets) {
        const real = ProbeSession.holdRealMs(done);
        assert.ok(real <= done.holdSec * 1000 + 1, `round ${round}: hold ${real} ms`);
      }
    }
  }
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exitCode = failed ? 1 : 0;
