// Where MediaPipe and the pose models are loaded from.
// By default everything comes from public CDNs. Open the page with `?local`
// to use self-hosted copies from ./vendor (see scripts/fetch-vendor.sh).

const params = new URLSearchParams(location.search);
const LOCAL = params.has('local');

export const MP_VERSION = '1.0.1';

const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODELS_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

export const VISION_BUNDLE = LOCAL ? new URL('../vendor/tasks-vision/vision_bundle.mjs', import.meta.url).href : `${CDN}/vision_bundle.mjs`;
export const WASM_BASE = LOCAL ? new URL('../vendor/tasks-vision/wasm', import.meta.url).href : `${CDN}/wasm`;

export const FACE_MODEL = LOCAL
  ? new URL('../vendor/models/blaze_face_short_range.tflite', import.meta.url).href
  : 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export const MODELS = {
  lite: LOCAL ? new URL('../vendor/models/pose_landmarker_lite.task', import.meta.url).href
              : `${MODELS_CDN}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  full: LOCAL ? new URL('../vendor/models/pose_landmarker_full.task', import.meta.url).href
              : `${MODELS_CDN}/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
};

// Debug flags, all optional: ?debug shows the metrics panel, ?cpu forces the CPU delegate.
export const FLAGS = {
  debug: params.has('debug'),
  forceCpu: params.has('cpu'),
};
