// Skeleton overlay on top of the camera preview.

const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function drawSkeleton(canvas, video, landmarks, color = '#5ef2c2') {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;
  const lw = Math.max(2, w / 160);
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const p = landmarks[a];
    const q = landmarks[b];
    const vis = Math.min(p.visibility ?? 1, q.visibility ?? 1);
    ctx.globalAlpha = vis > 0.5 ? 0.95 : 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  }
  for (const i of JOINTS) {
    const p = landmarks[i];
    ctx.globalAlpha = (p.visibility ?? 1) > 0.5 ? 1 : 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, lw * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function clearCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

export function drawFace(canvas, video, face, color = '#5ef2c2') {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!face) return;
  const lw = Math.max(2, w / 200);
  const { originX, originY, width, height } = face.box;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(originX, originY, width, height);
  ctx.fillStyle = '#ffffff';
  for (const k of face.keypoints) {
    ctx.beginPath();
    ctx.arc(k.x * w, k.y * h, lw * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
