// «Камера сидя». Runs the front camera and the prototype's face detector next to the 3D scene
// to see what the frame time becomes when both share the phone. It is a measurement, not a game:
// the probe is never played in a plank, so it needs no disclaimer or stop questions
// (spec-visual-v2 §9). Frames stay on the device, exactly as in the prototype (D4).

import { startCamera, stopCamera, VisionTracker, onEveryVideoFrame } from '../js/pose.js';

export class CameraProbe {
  constructor(video) {
    this.video = video;
    this.tracker = new VisionTracker();
    this.on = false;
    this.stopFrames = null;
    this.samples = [];
    this.face = false;
  }

  async start(onStatus = () => {}) {
    if (this.on) return;
    onStatus('Включаю камеру');
    await startCamera(this.video, { facingMode: 'user' });
    try {
      await this.tracker.init('face', 'lite', onStatus);
    } catch (err) {
      stopCamera(this.video);
      throw err;
    }
    this.samples = [];
    this.on = true;
    this.stopFrames = onEveryVideoFrame(this.video, (now) => {
      const r = this.tracker.detect(this.video);
      if (!r) return;
      this.face = Boolean(r.face);
      this.samples.push({ t: now, ms: r.ms });
      while (this.samples.length && now - this.samples[0].t > 2000) this.samples.shift();
    });
  }

  stop() {
    this.stopFrames?.();
    this.stopFrames = null;
    stopCamera(this.video);
    this.tracker.close();
    this.on = false;
    this.samples = [];
    this.face = false;
  }

  // Detections per second and inference time over the last two seconds.
  snapshot() {
    if (!this.on || this.samples.length < 2) return { on: this.on, rate: 0, ms: 0, face: this.face, delegate: this.tracker.delegate };
    const span = this.samples[this.samples.length - 1].t - this.samples[0].t;
    const ms = this.samples.reduce((a, s) => a + s.ms, 0) / this.samples.length;
    return { on: true, rate: span > 0 ? ((this.samples.length - 1) * 1000) / span : 0, ms, face: this.face, delegate: this.tracker.delegate };
  }
}
