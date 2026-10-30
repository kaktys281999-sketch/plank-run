// Sound of the timer probe.
//
// One AudioContext, created only after navigator.audioSession.type is set: on
// iPhone the type has to be set before the context exists for «playback» to
// keep the voice audible with the silent switch on (research/v3 W2, secondary
// source; the probe measures it). Changing the mode closes the context and
// makes a new one in the same tap, since nobody has checked whether a new type
// reaches an open context (platform-v3 §3.7).
//
// Voice clips are decoded once and put on the audio clock in advance with
// start(when), so they keep their time while the page code sleeps (platform-v3
// П4). Speech synthesis covers the lines without a clip and needs the visible page.

const MANIFEST = new URL('../../assets/voice/manifest.json', import.meta.url).href;
export const CLIP_IDS = ['p_go', 'breathe', 'ten_left', 'five_left', 'p_three_two_one', 'p_rest', 'p_stop_pain'];

const BEEPS = {
  tick: [[1046.5, 0.07]],
  done: [[783.99, 0.12], [1046.5, 0.18, 0.13]],
  check: [[880, 0.15]],
};

export class ProbeSound {
  constructor(log) {
    this.log = log;               // (type, data) => void, the measurement log
    this.mode = 'playback';       // 'playback' | 'ambient'
    this.ctx = null;
    this.master = null;
    this.raw = new Map();         // clip id -> ArrayBuffer, kept to decode again for a new context
    this.buffers = new Map();     // clip id -> AudioBuffer of the current context
    this.texts = {};              // clip id -> line text, for subtitles
    this.pending = new Set();     // scheduled sources that have not ended yet
    this.loaded = null;
    this.ctxCount = 0;            // every new context restarts its clock, the report keeps them apart
    this.runEpoch = 0;            // grows each time the context comes back to «running»
    this.voice = null;
    this.hasSessionApi = 'audioSession' in navigator;
    if ('speechSynthesis' in window) {
      const pick = () => {
        const ru = speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
        this.voice = ru.find((v) => v.localService) ?? ru[0] ?? null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  get state() {
    return this.ctx?.state ?? 'none';
  }

  get time() {
    return this.ctx?.currentTime ?? null;
  }

  // Inside a tap. Sets the session type, creates or resumes the context and
  // starts speech once, because iOS speaks only after a first gesture.
  unlock() {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    let typeSet = null;
    if (this.hasSessionApi) {
      try {
        navigator.audioSession.type = this.mode;
        typeSet = navigator.audioSession.type;
      } catch (e) {
        typeSet = `ошибка ${e.name}`;
      }
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.log('audio', { event: 'no AudioContext' });
      return;
    }
    const ctx = new AC();
    this.ctx = ctx;
    this.ctxCount += 1;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.runEpoch += 1;
      this.log('audio', { event: 'state', state: ctx.state, ctxTime: round3(ctx.currentTime), mode: this.mode });
    };
    ctx.resume().catch(() => {});
    this.log('audio', { event: 'context', mode: this.mode, sessionType: typeSet, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency ?? null });
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    this.buffers.clear();
    this.load().then(() => this.#decodeAll(ctx));
  }

  // Inside a tap: the old context goes, a new one with the other session type comes.
  setMode(mode) {
    if (mode === this.mode && this.ctx) return;
    this.mode = mode;
    this.cancel('mode');
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.unlock();
  }

  // Fetches the manifest and the few clips the probe needs. Never throws:
  // a missing clip is spoken by speech instead.
  load() {
    this.loaded ??= (async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(MANIFEST, { cache: 'no-cache' });
        const manifest = await res.json();
        const voice = manifest.voices?.[manifest.default] ?? {};
        await Promise.all(CLIP_IDS.map(async (id) => {
          const entry = voice[id];
          if (!entry) return;
          this.texts[id] = entry.text;
          const r = await fetch(new URL(`../../${entry.file}`, import.meta.url).href);
          if (r.ok) this.raw.set(id, await r.arrayBuffer());
        }));
        this.log('audio', { event: 'clips fetched', count: this.raw.size, of: CLIP_IDS.length, ms: Math.round(performance.now() - t0) });
      } catch (e) {
        this.log('audio', { event: 'clips failed', error: String(e) });
      }
    })();
    return this.loaded;
  }

  async #decodeAll(ctx) {
    let ok = 0;
    await Promise.all([...this.raw].map(async ([id, data]) => {
      try {
        // decodeAudioData detaches its input, the copy stays for the next context.
        const buf = await ctx.decodeAudioData(data.slice(0));
        if (this.ctx === ctx) this.buffers.set(id, buf);
        ok++;
      } catch (e) {
        this.log('audio', { event: 'decode failed', id, error: e?.name ?? String(e) });
      }
    }));
    this.log('audio', { event: 'clips decoded', count: ok });
  }

  hasClip(id) {
    return this.buffers.has(id);
  }

  clipSec(id) {
    return this.buffers.get(id)?.duration ?? 0;
  }

  // Seconds of audio clock from now to the page-clock moment atMono.
  #when(atMono) {
    return this.ctx.currentTime + Math.max(0, (atMono - performance.now()) / 1000);
  }

  // Puts a clip on the audio clock to start at the page-clock moment atMono (ms).
  clipAt(id, atMono, tag = '') {
    const buf = this.buffers.get(id);
    if (!this.ctx || !buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    this.#track(src, { kind: 'clip', id, tag, atMono, when: this.#when(atMono) });
    return true;
  }

  beepAt(kind, atMono, tag = '') {
    if (!this.ctx) return;
    const base = this.#when(atMono);
    for (const [freq, dur, delay = 0] of BEEPS[kind] ?? []) {
      const t = base + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      this.#track(osc, { kind: 'beep', id: kind, tag, atMono, when: t, stopAt: t + dur + 0.02 });
    }
  }

  #track(node, meta) {
    const item = { node, ...meta, cancelled: false };
    node.onended = () => {
      this.pending.delete(item);
      if (meta.kind === 'clip') {
        this.log('clip', {
          id: meta.id,
          tag: meta.tag,
          plannedMono: Math.round(meta.atMono),
          endedMono: Math.round(performance.now()),
          cancelled: item.cancelled,
          hiddenNow: document.hidden,
        });
      }
    };
    node.start(meta.when);
    if (meta.stopAt) node.stop(meta.stopAt);
    this.pending.add(item);
  }

  // Takes every scheduled sound off the audio clock (stop, a new countdown, a mode change).
  cancel(why = '') {
    for (const item of this.pending) {
      item.cancelled = true;
      try { item.node.stop(); } catch { /* already stopped */ }
    }
    if (this.pending.size) this.log('audio', { event: 'cancelled', count: this.pending.size, why });
    this.pending.clear();
  }

  // A line without a clip. Only the visible page can start speech.
  say(text) {
    if (!text || !('speechSynthesis' in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    if (this.voice) u.voice = this.voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    this.log('say', { text, hiddenNow: document.hidden });
    return true;
  }

  stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  static ruVoices() {
    if (!('speechSynthesis' in window)) return null;
    return speechSynthesis.getVoices()
      .filter((v) => /^ru/i.test(v.lang))
      .map((v) => ({ name: v.name, lang: v.lang, local: v.localService, isDefault: v.default }));
  }
}

const round3 = (x) => Math.round(x * 1000) / 1000;
