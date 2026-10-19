// One Euro filter (Casiez et al., 2012): an adaptive low-pass filter.
// Slow movements are smoothed hard (no jitter), fast movements pass through
// with little lag. This is the standard choice for noisy pose landmarks.

function smoothingFactor(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  // value: number, t: seconds
  filter(value, t) {
    if (this.x === null || this.t === null || t <= this.t) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = Math.min(t - this.t, 0.5);
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += smoothingFactor(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += smoothingFactor(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

// A boolean that only flips after the new value has persisted for a while.
// Prevents the game from pausing on a single bad frame.
export class Debounced {
  constructor(initial, { onDelay = 0.3, offDelay = 0.4 } = {}) {
    this.value = initial;
    this.pending = initial;
    this.since = 0;
    this.onDelay = onDelay;
    this.offDelay = offDelay;
  }

  update(raw, t) {
    if (raw === this.value) {
      this.pending = raw;
      return this.value;
    }
    if (raw !== this.pending) {
      this.pending = raw;
      this.since = t;
    }
    const delay = raw ? this.onDelay : this.offDelay;
    if (t - this.since >= delay) this.value = raw;
    return this.value;
  }

  force(value) {
    this.value = value;
    this.pending = value;
  }
}
