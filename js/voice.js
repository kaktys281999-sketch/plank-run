// Pre-rendered voice prompts with a speechSynthesis fallback.
//
// Why clips: speechSynthesis has no Russian voice on part of the systems and on
// iOS stays silent until a gesture (plan §2, §12.1). Clips are rendered once
// (tools/tts) into assets/voice/<voice>/<lineId>.m4a and listed in
// assets/voice/manifest.json:
//   {"default":"<voice>","voices":{"<voice>":{"<lineId>":{"file":"…","text":"…","ms":1234}}}}
// They are decoded up front onto the shared AudioContext (js/audio.js Sound),
// so a prompt starts instantly mid-plank. Any line whose clip is missing or
// fails to decode is spoken by speechSynthesis(text) instead; with no speech
// either, play() still resolves after the expected duration, so scripted
// flows keep their timing.

import { VOICE_LINES } from './voice-lines.js';

const MANIFEST = 'assets/voice/manifest.json';
const LOAD_CONCURRENCY = 6; // gentle on slow phones and flaky mobile links

// Rough speaking time for lines without a clip: ~13 chars/s plus a little air.
const estimateMs = (text) => Math.round(600 + (text?.length ?? 0) * 75);

export class VoicePlayer {
  // sound: a Sound instance (owns the AudioContext). Options:
  //  voice — voice name from the manifest (default: manifest.default)
  //  manifestUrl, base — where to look for the manifest and clips.
  constructor(sound, { voice = null, manifestUrl = MANIFEST, base = document.baseURI } = {}) {
    this.sound = sound;
    this.voiceName = voice;
    this.manifestUrl = new URL(manifestUrl, base).href;
    this.base = base;
    this.entries = {};          // lineId -> manifest entry
    this.buffers = new Map();   // lineId -> AudioBuffer
    this.current = null;        // { id, priority, stop }
    this.loading = null;
    this.ruVoice = null;
    this.stats = { manifest: false, voice: null, lines: Object.keys(VOICE_LINES).length, loaded: 0, failed: 0, loadMs: 0, via: { clip: 0, speech: 0, silent: 0 } };
    if ('speechSynthesis' in window) {
      const pick = () => {
        this.ruVoice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ru')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  text(id) {
    return VOICE_LINES[id] ?? this.entries[id]?.text ?? '';
  }

  hasClip(id) {
    return this.buffers.has(id);
  }

  // Expected duration of a line in ms (clip length, manifest hint or estimate).
  durationMs(id) {
    const b = this.buffers.get(id);
    if (b) return Math.round(b.duration * 1000);
    return this.entries[id]?.ms ?? estimateMs(this.text(id));
  }

  // Fetches the manifest and decodes every clip. Safe to call more than once;
  // never throws: whatever fails falls back to speech.
  load() {
    this.loading ??= this.#load();
    return this.loading;
  }

  async #load() {
    const t0 = performance.now();
    // Decoding works on a suspended context, so this may run before unlock().
    if (!this.sound.ctx) this.sound.unlock();
    const ctx = this.sound.ctx;
    try {
      const res = await fetch(this.manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const manifest = await res.json();
      const name = this.voiceName && manifest.voices?.[this.voiceName] ? this.voiceName : manifest.default;
      this.entries = manifest.voices?.[name] ?? {};
      this.stats.manifest = true;
      this.stats.voice = name ?? null;
    } catch (err) {
      console.info('Voice clips unavailable, using speechSynthesis', err.message);
      this.stats.loadMs = Math.round(performance.now() - t0);
      return this.stats;
    }
    // Browsers without AAC (some Linux Chromium/Firefox builds) can't decode .m4a:
    // don't download 21 clips just to fail on each.
    const probe = document.createElement('audio');
    // Ask for the exact codec: plain 'audio/mp4' answers "maybe" even without AAC.
    this.stats.codec = !!(probe.canPlayType?.('audio/mp4; codecs="mp4a.40.2"') || probe.canPlayType?.('audio/aac'));
    const ids = this.stats.codec ? Object.keys(VOICE_LINES).filter((id) => this.entries[id]?.file) : [];
    this.stats.failed = Object.keys(VOICE_LINES).length - ids.length;
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          if (!ctx) throw new Error('no AudioContext');
          const res = await fetch(new URL(this.entries[id].file, this.base).href);
          if (!res.ok) throw new Error(`${res.status}`);
          const data = await res.arrayBuffer();
          // Callback form: older Safari has no promise-returning decodeAudioData.
          const buffer = await new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
          this.buffers.set(id, buffer);
          this.stats.loaded += 1;
        } catch (err) {
          this.stats.failed += 1;
          console.info(`Voice clip ${id} failed, will use speech`, err?.message ?? err);
        }
      }
    };
    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
    this.stats.loadMs = Math.round(performance.now() - t0);
    return this.stats;
  }

  get busy() {
    return this.current !== null;
  }

  // Plays a line. Resolves with {id, via, skipped, interrupted} when it ends.
  //  priority — a line never cuts off one with a higher priority (it is dropped);
  //  interrupt — false = drop the line if anything is playing.
  play(id, { priority = 1, interrupt = true } = {}) {
    const text = this.text(id);
    if (this.current) {
      if (!interrupt || this.current.priority > priority) return Promise.resolve({ id, via: null, skipped: true });
      this.stop();
    }
    if (this.buffers.has(id) && this.sound.ctx) return this.#playClip(id, priority);
    if ('speechSynthesis' in window && text) return this.#speak(id, text, priority);
    this.stats.via.silent += 1;
    return this.#wait(id, priority, this.durationMs(id), 'silent');
  }

  stop() {
    const c = this.current;
    this.current = null;
    c?.stop();
  }

  #playClip(id, priority) {
    const ctx = this.sound.ctx;
    ctx.resume?.();
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get(id);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain).connect(ctx.destination);
    this.stats.via.clip += 1;
    return new Promise((resolve) => {
      let interrupted = false;
      const entry = {
        id,
        priority,
        stop: () => {
          interrupted = true;
          try { src.stop(); } catch { /* already stopped */ }
        },
      };
      this.current = entry;
      src.onended = () => {
        if (this.current === entry) this.current = null;
        resolve({ id, via: 'clip', interrupted });
      };
      src.start();
    });
  }

  #speak(id, text, priority) {
    this.stats.via.speech += 1;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    if (this.ruVoice) u.voice = this.ruVoice;
    u.rate = 1.05;
    return new Promise((resolve) => {
      let finished = false;
      let timer = 0;
      const entry = {
        id,
        priority,
        stop: () => {
          speechSynthesis.cancel();
          finish(true);
        },
      };
      const finish = (interrupted) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (this.current === entry) this.current = null;
        resolve({ id, via: 'speech', interrupted });
      };
      this.current = entry;
      const started = performance.now();
      const expected = estimateMs(text);
      // An engine that fails (no voice, not primed) must not shorten the script:
      // the text stays on screen for as long as saying it would take.
      const fallback = () => {
        if (finished) return;
        this.stats.speechErrors = (this.stats.speechErrors ?? 0) + 1;
        clearTimeout(timer);
        timer = setTimeout(() => finish(false), Math.max(0, expected - (performance.now() - started)));
      };
      u.onend = () => (performance.now() - started < expected * 0.3 ? fallback() : finish(false));
      u.onerror = fallback;
      // Some engines (iOS, headless) never fire onend: don't let the script hang.
      timer = setTimeout(() => finish(false), expected * 1.6 + 1500);
      speechSynthesis.speak(u);
    });
  }

  #wait(id, priority, ms, via) {
    return new Promise((resolve) => {
      const entry = {
        id,
        priority,
        stop: () => { clearTimeout(timer); done(true); },
      };
      const done = (interrupted) => {
        if (this.current === entry) this.current = null;
        resolve({ id, via, interrupted });
      };
      const timer = setTimeout(() => done(false), ms);
      this.current = entry;
    });
  }
}
