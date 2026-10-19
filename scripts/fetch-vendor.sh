#!/usr/bin/env bash
# Refreshes the self-hosted MediaPipe runtime + models in ./vendor (served from the app's own origin).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=1.0.1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm pack "@mediapipe/tasks-vision@$VERSION" --silent >/dev/null && tar -xzf ./*.tgz)
mkdir -p vendor/tasks-vision/wasm vendor/models
cp "$TMP/package/vision_bundle.mjs" vendor/tasks-vision/
cp "$TMP"/package/wasm/vision_wasm_internal.* "$TMP"/package/wasm/vision_wasm_nosimd_internal.* vendor/tasks-vision/wasm/
BASE=https://storage.googleapis.com/mediapipe-models/pose_landmarker
for m in lite full; do
  curl -fsSL -o "vendor/models/pose_landmarker_$m.task" "$BASE/pose_landmarker_$m/float16/1/pose_landmarker_$m.task"
done
curl -fsSL -o vendor/models/blaze_face_short_range.tflite \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
echo "Done: vendor/ updated"
