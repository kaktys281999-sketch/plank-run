// Timer engine of the timer probe. Pure logic, no DOM: the phases of one set and
// of the rest after it, driven by the clocks the caller passes in on every call.
//
// Why two clocks. A hold must never outlast its plan (PLAN D2, platform-v3 П6).
// The monotonic clock may stand still while the phone sleeps (not verified on
// iOS, research/v3 W2), so the elapsed time is the larger of the monotonic and
// the wall-clock difference whenever the wall one is plausible. The larger time
// gives the smaller remainder, which is the safe side.
//
// `now` everywhere is { mono, wall } in milliseconds: performance.now() and Date.now().

export const DEFAULTS = {
  holdSec: 20,          // the probe never holds longer (design-v3 §8)
  restSec: 60,          // design-v3 §8; the real rest rule is program §4.2
  doneMs: 1500,         // «Готово» before the rest screen (program §5.1)
  resumeSec: 5,         // countdown after «Продолжить», counted in the hold (platform-v3 П6)
  awaitRepeatSec: 60,   // «Продолжим?» after «Отметь подход» (program §5.4)
};

const WALL_PLAUSIBLE_MS = 2 * 3600 * 1000;

export function elapsedMs(from, now) {
  const mono = now.mono - from.mono;
  const wall = now.wall - from.wall;
  return wall >= 0 && wall <= WALL_PLAUSIBLE_MS ? Math.max(mono, wall) : mono;
}

const shift = (t, ms) => ({ mono: t.mono + ms, wall: t.wall + ms });

// Lines of a training hold of T seconds, program §11.2. `clips` are voice clips
// put on the audio clock in advance, so they can play even when the page code
// is asleep. `say` lines need speech synthesis, which only the visible page can
// start. `ticks` are short beeps under the last three numbers.
export function holdCues(T) {
  const cues = [];
  // «Держи!» has no clip yet (program §11.2), «Начали!» stands in for it.
  cues.push({ at: 0, clips: ['p_go'] });
  for (let s = 5; s < T - 10; s += 10) cues.push({ at: s, say: 'cue' });
  for (let s = 10; s < T - 10; s += 10) cues.push({ at: s, clips: ['breathe'] });
  // «Ещё десять, дыши» is not recorded yet; two clips keep «дыши» in the line.
  if (T >= 15) cues.push({ at: T - 10, clips: ['ten_left', 'breathe'] });
  if (T >= 10) cues.push({ at: T - 5, clips: ['five_left'] });
  if (T >= 3) cues.push({ at: T - 3, clips: ['p_three_two_one'], ticks: [T - 3, T - 2, T - 1] });
  cues.push({ at: T, beep: 'done', say: 'done' });
  // «Отдыхай» rides on the audio clock too: with the screen off it is the only
  // word that says the set is over.
  cues.push({ at: T + 1.8, clips: ['p_rest'] });
  return cues.sort((a, b) => a.at - b.at);
}

// Lines of the countdown before the pose, program §5.2 and §11.2. The pose is
// taken on «Три, два, один», so the clip ends where the hold begins.
export function prepCues(P, { firstOfExercise = false } = {}) {
  const cues = [{ at: 0, say: 'prep' }];
  // «Если больно, сразу остановись» (2,1 s) sits between the name and «Три, два, один».
  if (firstOfExercise && P >= 8) cues.push({ at: Math.min(3, P - 5.2), clips: ['p_stop_pain'] });
  if (P >= 3) cues.push({ at: P - 3, clips: ['p_three_two_one'], ticks: [P - 3, P - 2, P - 1] });
  return cues;
}

// One probe session: sets one after another, each with its countdown, hold and rest.
export class ProbeSession {
  constructor(options = {}) {
    this.o = { ...DEFAULTS, ...options };
    this.phase = 'idle';
    this.set = null;
    this.sets = [];
    this.hiddenAt = null;
  }

  // A new set starts with its countdown. `plan` = { exerciseId, place, layout, prepSec, firstOfExercise }.
  startSet(now, plan) {
    const no = (this.sets.at(-1)?.exerciseId === plan.exerciseId ? this.sets.at(-1).no : 0) + 1;
    this.set = {
      no,
      ...plan,
      holdSec: this.o.holdSec,
      restSec: this.o.restSec,
      prepStart: now,
      holdStart: null,
      holdEnd: null,
      endReason: null,      // 'time' | 'stopped' | 'interrupted'
      endedHidden: false,   // the plan ran out while the page was hidden
      mark: null,           // 'yes' | 'gap' | 'no'
      reason: null,         // what stopped the set, only after a stop or «Нет»
      restExtraSec: 0,
      resumeStart: null,
      awaitStart: null,
      continueSaid: false,
      hiddenMs: 0,
    };
    this.phase = 'prep';
    return [{ type: 'phase', phase: 'prep' }];
  }

  // «Начинаю» in the countdown jumps to «Три, два, один» (platform-v3 §3.3).
  skipPrep(now) {
    if (this.phase !== 'prep') return [];
    const left = this.set.prepSec * 1000 - elapsedMs(this.set.prepStart, now);
    if (left <= 3000) return [];
    this.set.prepStart = shift(this.set.prepStart, -(left - 3000));
    return [{ type: 'reschedule' }];
  }

  holdLeftMs(now) {
    return this.set.holdSec * 1000 - elapsedMs(this.set.holdStart, now);
  }

  restLeftMs(now) {
    return (this.set.restSec + this.set.restExtraSec) * 1000 - elapsedMs(this.set.holdEnd, now);
  }

  prepLeftMs(now) {
    return this.set.prepSec * 1000 - elapsedMs(this.set.prepStart, now);
  }

  // What the screen shows: the phase and the seconds left in it, rounded up.
  view(now) {
    const s = this.set;
    // left is what the digit shows, rounded up; leftMs drives the smooth ring.
    const v = (phase, ms, total, extra = {}) => ({ phase, left: Math.max(0, Math.ceil(ms / 1000 - 1e-9)), leftMs: Math.max(0, ms), total, ...extra });
    switch (this.phase) {
      case 'prep': return v('prep', this.prepLeftMs(now), s.prepSec);
      case 'hold':
      case 'interrupted': return v(this.phase, this.holdLeftMs(now), s.holdSec);
      case 'resume': return v('resume', this.o.resumeSec * 1000 - elapsedMs(s.resumeStart, now), this.o.resumeSec, { holdLeftMs: this.holdLeftMs(now) });
      case 'done': return v('done', 0, s.holdSec);
      case 'rest': return v('rest', this.restLeftMs(now), s.restSec + s.restExtraSec);
      default: return v(this.phase, 0, 0);
    }
  }

  #endHold(now, reason, at) {
    const s = this.set;
    s.holdEnd = at ?? now;
    s.endReason = reason;
    this.sets.push(s);
  }

  // Moves the clock forward. Returns events for the caller: phase changes and lines to say.
  tick(now) {
    const s = this.set;
    const ev = [];
    if (!s) return ev;
    if (this.phase === 'prep' && this.prepLeftMs(now) <= 0) {
      // The hold begins where the countdown planned it, not at the late frame.
      s.holdStart = shift(s.prepStart, s.prepSec * 1000);
      this.phase = 'hold';
      ev.push({ type: 'phase', phase: 'hold' });
    }
    if (this.phase === 'resume' && elapsedMs(s.resumeStart, now) >= this.o.resumeSec * 1000) {
      this.phase = 'hold';
      ev.push({ type: 'phase', phase: 'hold' });
    }
    if ((this.phase === 'hold' || this.phase === 'resume') && this.holdLeftMs(now) <= 0) {
      this.#endHold(now, 'time', shift(s.holdStart, s.holdSec * 1000));
      this.phase = 'done';
      ev.push({ type: 'phase', phase: 'done' });
    }
    if (this.phase === 'interrupted' && this.holdLeftMs(now) <= this.o.resumeSec * 1000) {
      // Nothing left to continue: the 5 s countdown would eat the rest (П6).
      this.#endHold(now, 'interrupted', this.holdLeftMs(now) <= 0 ? shift(s.holdStart, s.holdSec * 1000) : now);
      this.phase = 'rest';
      ev.push({ type: 'phase', phase: 'rest' });
    }
    if (this.phase === 'done' && elapsedMs(s.holdEnd, now) >= this.o.doneMs) {
      this.phase = 'rest';
      ev.push({ type: 'phase', phase: 'rest' });
    }
    if (this.phase === 'rest' && this.restLeftMs(now) <= 0) {
      if (s.mark) {
        this.phase = 'next';
        ev.push({ type: 'phase', phase: 'next' });
      } else {
        // The rest is over and the set has no mark: the next set waits (program §5.4).
        s.awaitStart = shift(s.holdEnd, (s.restSec + s.restExtraSec) * 1000);
        this.phase = 'awaitMark';
        ev.push({ type: 'phase', phase: 'awaitMark' }, { type: 'say', line: 'mark' });
      }
    }
    if (this.phase === 'awaitMark' && !s.continueSaid && elapsedMs(s.awaitStart, now) >= this.o.awaitRepeatSec * 1000) {
      s.continueSaid = true;
      ev.push({ type: 'say', line: 'continue' });
    }
    return ev;
  }

  // «Стоп» or «Закончить подход». Before the hold nothing is recorded.
  stop(now) {
    if (this.phase === 'prep') {
      this.phase = 'ready';
      return [{ type: 'phase', phase: 'ready' }];
    }
    if (this.phase === 'hold' || this.phase === 'resume' || this.phase === 'interrupted') {
      this.#endHold(now, 'stopped');
      this.set.mark = 'no'; // a stop is already the answer «Нет» (program §5.4)
      this.phase = 'rest';
      return [{ type: 'phase', phase: 'rest' }, { type: 'askReason' }];
    }
    return [];
  }

  mark(answer, now) {
    if (!this.set || !['rest', 'awaitMark', 'done'].includes(this.phase)) return [];
    this.set.mark = answer;
    const ev = [{ type: 'marked', answer }];
    if (answer === 'no' && !this.set.reason) ev.push({ type: 'askReason' });
    if (this.phase === 'awaitMark') {
      this.phase = 'next';
      ev.push({ type: 'phase', phase: 'next' });
    }
    return ev;
  }

  reason(r) {
    if (this.set) this.set.reason = r;
  }

  // The rest can be longer, never shorter (program §4.2).
  extendRest(sec) {
    if (this.phase === 'rest' && sec > 0) this.set.restExtraSec += sec;
  }

  hidden(now) {
    this.hiddenAt = now;
  }

  // Back from a hidden page (screen off, another app, a call). Platform-v3 §3.9.
  visible(now) {
    const s = this.set;
    const was = this.hiddenAt;
    this.hiddenAt = null;
    if (!s) return [];
    if (was && s.holdStart && !s.holdEnd) s.hiddenMs += elapsedMs(was, now);
    if (this.phase === 'prep') {
      // An interrupted countdown simply starts again.
      s.prepStart = now;
      return [{ type: 'phase', phase: 'prep' }, { type: 'reschedule' }];
    }
    if (this.phase === 'hold' || this.phase === 'resume') {
      const left = this.holdLeftMs(now);
      if (left <= 0) {
        this.#endHold(now, 'interrupted', shift(s.holdStart, s.holdSec * 1000));
        s.endedHidden = true;
        this.phase = 'rest';
        return [{ type: 'phase', phase: 'rest' }];
      }
      if (left <= this.o.resumeSec * 1000) {
        this.#endHold(now, 'interrupted');
        this.phase = 'rest';
        return [{ type: 'phase', phase: 'rest' }];
      }
      this.phase = 'interrupted';
      return [{ type: 'phase', phase: 'interrupted' }];
    }
    return [];
  }

  // «Продолжить» on the interrupted screen: a 5 s countdown inside the remainder.
  resume(now) {
    if (this.phase !== 'interrupted') return [];
    if (this.holdLeftMs(now) <= this.o.resumeSec * 1000) return this.tick(now);
    this.set.resumeStart = now;
    this.phase = 'resume';
    return [{ type: 'phase', phase: 'resume' }];
  }

  finish() {
    this.phase = 'over';
    return [{ type: 'phase', phase: 'over' }];
  }

  // Real length of a finished hold by the safe clock, for tests and the report.
  static holdRealMs(set) {
    return set.holdStart && set.holdEnd ? elapsedMs(set.holdStart, set.holdEnd) : 0;
  }
}
