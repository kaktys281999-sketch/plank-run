// Sound effects (WebAudio, no files). Voice prompts live in js/voice.js and
// play on this AudioContext.

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.voice = true;
  }

  // Must be called from a user gesture (browsers block audio otherwise).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    this.ctx?.resume?.();
  }

  // iOS only allows speech that was first started inside a user gesture.
  prime() {
    if (!this.voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  tone(freq, dur = 0.12, { type = 'sine', gain = 0.15, slide = 0, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  coin() { this.tone(1320, 0.08, { type: 'square', gain: 0.05 }); this.tone(1760, 0.1, { type: 'square', gain: 0.05, delay: 0.06 }); }
  pass(combo = 1) { this.tone(520 + Math.min(combo, 10) * 40, 0.14, { type: 'triangle', gain: 0.12 }); }
  hit() { this.tone(160, 0.3, { type: 'sawtooth', gain: 0.12, slide: 0.5 }); }
  // Catch sounds climb a pentatonic scale as the streak grows, so a good run sounds like a melody.
  chime(combo = 1, type = 'normal') {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
    const f = scale[Math.min(combo - 1, scale.length - 1)];
    this.tone(f, 0.18, { type: 'triangle', gain: 0.1 });
    if (type === 'gold') this.tone(f * 1.5, 0.2, { type: 'triangle', gain: 0.08, delay: 0.07 });
    if (type === 'moon') [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(f * m, 0.22, { type: 'sine', gain: 0.09, delay: i * 0.08 }));
  }

  warn() { this.tone(440, 0.15, { type: 'square', gain: 0.07 }); this.tone(330, 0.2, { type: 'square', gain: 0.07, delay: 0.17 }); }
  tick() { this.tone(880, 0.08, { type: 'sine', gain: 0.12 }); }
  go() { this.tone(1046, 0.25, { type: 'triangle', gain: 0.15 }); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.12, delay: i * 0.12 })); }
}
