// Frame time meter. The probe exists to answer «сколько кадров на моём телефоне», so it keeps
// the last few seconds for the live counter and every frame of a run for the result card.

const WINDOW = 240;

export class Perf {
  constructor() {
    this.last = 0;
    this.ring = new Float32Array(WINDOW);
    this.count = 0;
    this.head = 0;
    this.run = null;
  }

  tick(now) {
    const dt = this.last ? now - this.last : 0;
    this.last = now;
    // A hidden tab or a permission prompt stalls rAF; such gaps are not frames.
    if (dt <= 0 || dt > 250) return;
    this.ring[this.head] = dt;
    this.head = (this.head + 1) % WINDOW;
    this.count = Math.min(this.count + 1, WINDOW);
    this.run?.push(dt);
  }

  // Live numbers over roughly the last two seconds.
  recent() {
    const frames = [];
    let sum = 0;
    for (let i = 1; i <= this.count && sum < 2000; i++) {
      const dt = this.ring[(this.head - i + WINDOW) % WINDOW];
      frames.push(dt);
      sum += dt;
    }
    return summarize(frames);
  }

  startRun() {
    this.run = [];
  }

  stopRun() {
    const result = summarize(this.run ?? []);
    this.run = null;
    return result;
  }
}

function summarize(frames) {
  if (!frames.length) return { fps: 0, avgMs: 0, p95Ms: 0, frames: 0 };
  const total = frames.reduce((a, b) => a + b, 0);
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    fps: (frames.length * 1000) / total,
    avgMs: total / frames.length,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    frames: frames.length,
  };
}
