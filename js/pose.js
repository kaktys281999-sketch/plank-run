// Camera access + MediaPipe vision tasks running in the browser.
// No frame ever leaves the device: inference happens locally (WASM + WebGL).

import { SOURCES, FLAGS } from './config.js';

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function startCamera(video, { facingMode = 'user' } = {}) {
  if (!window.isSecureContext) {
    throw new CameraError('insecure', 'Камера работает только по HTTPS или на localhost.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Этот браузер не даёт доступ к камере.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode,
        // The model works on a 256×256 crop, so a small stream is enough
        // and keeps phones cool.
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new CameraError('denied', 'Доступ к камере запрещён. Разреши его в настройках сайта и обнови страницу.');
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      throw new CameraError('notfound', 'Камера не найдена.');
    }
    if (err.name === 'NotReadableError') {
      throw new CameraError('busy', 'Камера занята другим приложением.');
    }
    throw new CameraError('unknown', `Не удалось включить камеру: ${err.message}`);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  return stream;
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

// Wraps the two MediaPipe tasks the app uses:
//  - 'face': BlazeFace detector (front camera: the face is what the camera sees best)
//  - 'pose': Pose Landmarker, 33 body points (side camera: full-body form check)
export class VisionTracker {
  constructor() {
    this.task = null;
    this.kind = null;
    this.modelKey = null;
    this.delegate = null;
    this.lastTs = 0;
    this.vision = null;
    this.fileset = null;
    this.source = null;
    this.switching = false;
  }

  async init(kind, modelKey = 'lite', onStatus = () => {}) {
    if (this.task && this.kind === kind && (kind === 'face' || this.modelKey === modelKey)) return;
    this.close();
    const delegates = FLAGS.forceCpu ? ['CPU'] : ['GPU', 'CPU'];
    // Once a source works, stick to it; otherwise try them in order (local copies, then CDN).
    const sources = this.source ? [this.source, ...SOURCES.filter((s) => s !== this.source)] : SOURCES;
    let lastErr;
    for (const source of sources) {
      try {
        onStatus('Загружаю MediaPipe…');
        if (this.source !== source) {
          this.vision = await import(/* @vite-ignore */ source.bundle);
          this.fileset = await this.vision.FilesetResolver.forVisionTasks(source.wasm);
        }
        this.source = source;
      } catch (err) {
        lastErr = err;
        console.warn(`MediaPipe from ${source.name} failed`, err);
        continue;
      }
      onStatus(kind === 'face' ? 'Загружаю детектор лица…' : 'Загружаю модель позы…');
      for (const delegate of delegates) {
        try {
          this.task = await this.create(kind, modelKey, delegate);
          this.kind = kind;
          this.modelKey = modelKey;
          this.delegate = delegate;
          return;
        } catch (err) {
          lastErr = err;
          console.warn(`${kind} from ${source.name} with ${delegate} failed`, err);
        }
      }
      this.source = null;
    }
    throw new Error(`Не удалось загрузить модель: ${lastErr?.message ?? lastErr}`);
  }

  create(kind, modelKey, delegate) {
    if (kind === 'face') {
      return this.vision.FaceDetector.createFromOptions(this.fileset, {
        baseOptions: { modelAssetPath: this.source.face, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
    }
    return this.vision.PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: this.source.pose[modelKey], delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  // Returns null when not ready, otherwise {ms, face} or {ms, landmarks, world};
  // face / landmarks are null when nobody is in frame.
  detect(video) {
    if (!this.task || this.switching || video.readyState < 2) return null;
    // detectForVideo requires strictly increasing timestamps.
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;
    const t0 = performance.now();
    let result;
    try {
      result = this.task.detectForVideo(video, ts);
    } catch (err) {
      // Some mobile GPUs create the delegate fine but fail on first use.
      if (this.delegate === 'GPU') {
        console.warn('GPU inference failed, switching to CPU', err);
        this.fallbackToCpu();
        return null;
      }
      throw err;
    }
    const ms = performance.now() - t0;
    if (this.kind === 'face') return { ms, face: largestFace(result.detections) };
    if (!result.landmarks?.length) return { ms, landmarks: null, world: null };
    return { ms, landmarks: result.landmarks[0], world: result.worldLandmarks?.[0] ?? null };
  }

  async fallbackToCpu() {
    if (this.switching) return;
    this.switching = true;
    const { kind, modelKey } = this;
    this.task?.close();
    try {
      this.task = await this.create(kind, modelKey, 'CPU');
      this.delegate = 'CPU';
    } finally {
      this.switching = false;
    }
  }

  close() {
    this.task?.close();
    this.task = null;
    this.kind = null;
  }
}

// The closest face (largest box) wins; anyone walking behind you is ignored.
function largestFace(detections) {
  let best = null;
  for (const d of detections ?? []) {
    const b = d.boundingBox;
    if (!b || (best && b.width <= best.fs)) continue;
    best = {
      cx: b.originX + b.width / 2,
      cy: b.originY + b.height / 2,
      fs: b.width,
      score: d.categories?.[0]?.score ?? 0,
      box: b,
      keypoints: d.keypoints ?? [],
    };
  }
  return best;
}

// Calls `fn(now)` once per new camera frame (falls back to rAF polling).
export function onEveryVideoFrame(video, fn) {
  let stopped = false;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const tick = (now) => {
      if (stopped) return;
      fn(now);
      video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  } else {
    let lastTime = -1;
    const tick = (now) => {
      if (stopped) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        fn(now);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return () => { stopped = true; };
}
