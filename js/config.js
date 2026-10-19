// Where MediaPipe and the models are loaded from.
// Self-hosted copies in ./vendor come first: same origin, faster, and they keep working
// where public CDNs are blocked or throttled. Public CDNs are the fallback.
// ?cdn skips the local copies (handy when ./vendor wasn't fetched).

const params = new URLSearchParams(location.search);

export const MP_VERSION = '1.0.1';

const local = (path) => new URL(`../vendor/${path}`, import.meta.url).href;
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const GOOGLE = 'https://storage.googleapis.com/mediapipe-models';

export const SOURCES = [
  {
    name: 'local',
    bundle: local('tasks-vision/vision_bundle.mjs'),
    wasm: local('tasks-vision/wasm'),
    face: local('models/blaze_face_short_range.tflite'),
    pose: {
      lite: local('models/pose_landmarker_lite.task'),
      full: local('models/pose_landmarker_full.task'),
    },
  },
  {
    name: 'cdn',
    bundle: `${CDN}/vision_bundle.mjs`,
    wasm: `${CDN}/wasm`,
    face: `${GOOGLE}/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
    pose: {
      lite: `${GOOGLE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
      full: `${GOOGLE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
    },
  },
].filter((s) => !(params.has('cdn') && s.name === 'local'));

// Debug flags, all optional: ?debug shows the metrics panel, ?cpu forces the CPU delegate.
// ?protocol opens the Stage 0 field test instead of the home screen (js/protocol/).
export const FLAGS = {
  debug: params.has('debug'),
  forceCpu: params.has('cpu'),
  protocol: params.has('protocol'),
};
