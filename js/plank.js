// Turns detections into "are you still in a good plank?" + a game control signal.
//
// Two camera setups:
//  - front: the device lies on the floor in front of you and you look at the screen.
//           A full-body model is unreliable here (the body is extremely foreshortened),
//           so we track the FACE: it is what the camera sees best. Steering = shifting
//           your body left/right (or up/down). Form check = you hold the calibrated
//           position: you didn't drop to the floor, stand up or crawl away.
//           Hip sag cannot be measured from this angle.
//  - side:  the device is 2–3 m to the side and sees the whole body. Full pose model,
//           real form check (hip sag / pike / knees on the floor), steering = rocking
//           forward/back over your hands.

import { OneEuroFilter, Debounced } from './filters.js';

export const LM = {
  NOSE: 0,
  L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANK: 27, R_ANK: 28,
};

export const ISSUE_TEXT = {
  lost: 'Не вижу тебя в кадре',
  noFace: 'Не вижу лицо — смотри на экран',
  notVisible: 'Тело не целиком в кадре',
  tooFar: 'Ты слишком далеко от камеры',
  moved: 'Ты сместился — вернись на место',
  standing: 'Прими упор лёжа',
  noSupport: 'Упрись руками или локтями в пол',
  sag: 'Таз провис — подтяни живот',
  pike: 'Таз слишком высоко — опусти',
  knees: 'Колени на полу — выпрями ноги',
  lying: 'Ты опустился — вернись в планку',
};

// Front units: face widths (distance-independent). Side units: shoulder-to-ankle lengths.
export const THRESHOLDS = {
  front: {
    minScore: 0.5,
    minFaceFrac: 0.05,        // face width / frame width; smaller = too far
    scaleRange: [0.7, 1.45],  // face size vs baseline = moved toward/away
    drop: 1.2,                // face went down this much = lying on the floor
    rise: 1.6,                // face went up this much = stood up / knelt up
    sideways: 2.4,
  },
  side: {
    minVisibility: 0.5,
    maxBodyAngle: 40,  // degrees from horizontal; standing ≈ 90
    // Before calibration only gross faults are flagged...
    sagAbs: 0.06,
    pikeAbs: 0.1,
    // ...after it, deviations from your own straight line (the baseline is clamped,
    // so calibrating while already sagging doesn't hide the fault).
    // Tuned on synthetic renders: landmark noise ≈ ±0.01, an 18° sag ≈ +0.045, a 25° pike ≈ −0.09.
    sag: 0.03,
    pike: 0.05,
    baselineClamp: [-0.05, 0.02],
    knees: 0.07,       // knee below the hip–ankle line = knees on the floor
  },
};

// Body movement for full deflection at sensitivity 1.
const CONTROL_RANGE = {
  frontX: 0.45,  // face widths ≈ 7 cm of sideways shift
  frontY: 0.4,
  sideFB: 0.05,  // body lengths ≈ 7 cm forward/back
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function point(lms, i, w, h) {
  const p = lms[i];
  return { x: p.x * w, y: p.y * h, v: p.visibility ?? 1 };
}

// Visibility-weighted blend of the left and right joint (side view: the near side wins).
function blend(a, b) {
  const wa = a.v * a.v + 1e-6;
  const wb = b.v * b.v + 1e-6;
  return { x: (a.x * wa + b.x * wb) / (wa + wb), y: (a.y * wa + b.y * wb) / (wa + wb), v: Math.max(a.v, b.v) };
}

// Signed distance of p from the line a→b, positive when p is BELOW the line in the image.
function belowLine(p, a, b) {
  const len = dist(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  let nx = -uy;
  let ny = ux;
  if (ny < 0) { nx = -nx; ny = -ny; }
  return (p.x - a.x) * nx + (p.y - a.y) * ny;
}

export function faceFeatures(face, w) {
  return { score: face.score, cx: face.cx, cy: face.cy, fs: face.fs, faceFrac: face.fs / w };
}

export function sideFeatures(lms, w, h, kneePlank) {
  const j = (l, r) => blend(point(lms, l, w, h), point(lms, r, w, h));
  const SH = j(LM.L_SH, LM.R_SH);
  const EL = j(LM.L_EL, LM.R_EL);
  const WR = j(LM.L_WR, LM.R_WR);
  const HIP = j(LM.L_HIP, LM.R_HIP);
  const KNEE = j(LM.L_KNEE, LM.R_KNEE);
  const ANK = j(LM.L_ANK, LM.R_ANK);
  const END = kneePlank ? KNEE : ANK; // far end of the "straight line"
  const L = dist(SH, END) || 1;
  const dir = Math.sign(SH.x - END.x) || 1;
  const hand = WR.v > 0.4 ? WR : EL;
  return {
    visibility: Math.min(SH.v, HIP.v, END.v + 0.2),
    L,
    bodyAngle: (Math.atan2(END.y - SH.y, Math.abs(SH.x - END.x)) * 180) / Math.PI,
    hipDev: belowLine(HIP, SH, END) / L,
    kneeDev: kneePlank ? 0 : belowLine(KNEE, HIP, ANK) / L,
    support: hand.y > SH.y && EL.y > SH.y - 0.05 * L,
    fb: (dir * (SH.x - hand.x)) / L,
  };
}

export class PlankAnalyzer {
  constructor(settings) {
    this.settings = settings; // {camera: 'front'|'side', kneePlank, sensitivity}
    this.side = settings.camera === 'side';
    this.baseline = null;
    this.calib = [];
    this.calibSince = null;
    this.lastSeen = -Infinity;
    this.formOk = new Debounced(false, { onDelay: 0.25, offDelay: 0.45 });
    this.issue = 'lost';
    this.filterX = new OneEuroFilter({ minCutoff: 1.2, beta: 0.4 });
    this.filterY = new OneEuroFilter({ minCutoff: 1.2, beta: 0.4 });
    this.last = null;
  }

  get calibrated() {
    return this.baseline !== null;
  }

  resetCalibration() {
    this.baseline = null;
    this.calib = [];
    this.calibSince = null;
    this.formOk.force(false);
    this.filterX.reset();
    this.filterY.reset();
  }

  // det: output of VisionTracker.detect, w/h: video size, t: seconds.
  update(det, w, h, t) {
    const found = this.side ? det?.landmarks : det?.face;
    const out = { t, present: false, ready: false, rawIssue: this.side ? 'lost' : 'noFace', checks: {}, f: null, control: { x: 0, y: 0 } };
    if (found) {
      this.lastSeen = t;
      const f = this.side ? sideFeatures(det.landmarks, w, h, this.settings.kneePlank) : faceFeatures(det.face, w);
      const checks = this.side ? this.sideChecks(f) : this.frontChecks(f);
      out.f = f;
      out.present = true;
      out.checks = checks;
      // "ready" = good enough to calibrate on.
      out.rawIssue = this.side ? this.sideIssue(f, checks) : this.frontIssue(f, checks);
      out.ready = out.rawIssue === null;
      out.control = this.controlFrom(f, t);
    } else if (t - this.lastSeen < 0.3) {
      // A single missed detection: keep the previous state.
      return this.last ?? out;
    }
    out.formOk = this.formOk.update(out.rawIssue === null, t);
    // While debouncing back to "ok", keep showing the last reason.
    if (out.rawIssue !== null) this.issue = out.rawIssue;
    out.issue = out.formOk ? null : this.issue;
    this.last = out;
    return out;
  }

  frontChecks(f) {
    const T = THRESHOLDS.front;
    return {
      face: f.score >= T.minScore,
      distance: f.faceFrac >= T.minFaceFrac,
    };
  }

  frontIssue(f, c) {
    const T = THRESHOLDS.front;
    if (!c.face) return 'noFace';
    if (!c.distance) return 'tooFar';
    const b = this.baseline;
    if (!b) return null;
    const scale = f.fs / b.fs;
    if (scale < T.scaleRange[0] || scale > T.scaleRange[1]) return 'moved';
    const dy = (f.cy - b.cy) / b.fs;
    if (dy > T.drop) return 'lying';
    if (dy < -T.rise) return 'standing';
    if (Math.abs(f.cx - b.cx) / b.fs > T.sideways) return 'moved';
    return null;
  }

  sideChecks(f) {
    const T = THRESHOLDS.side;
    const dev = this.hipDeviation(f);
    return {
      visible: f.visibility > T.minVisibility,
      horizontal: Math.abs(f.bodyAngle) < T.maxBodyAngle,
      support: f.support,
      knees: this.settings.kneePlank ? true : f.kneeDev < T.knees,
      straight: this.baseline ? dev < T.sag && dev > -T.pike : f.hipDev < T.sagAbs && f.hipDev > -T.pikeAbs,
    };
  }

  hipDeviation(f) {
    if (!this.baseline) return f.hipDev;
    const [lo, hi] = THRESHOLDS.side.baselineClamp;
    return f.hipDev - clamp(this.baseline.hipDev, lo, hi);
  }

  sideIssue(f, c) {
    if (!c.visible) return 'notVisible';
    if (!c.horizontal) return 'standing';
    if (!c.support) return 'noSupport';
    if (!c.knees) return 'knees';
    if (!c.straight) {
      const dev = this.hipDeviation(f);
      return dev > 0 ? 'sag' : 'pike';
    }
    const b = this.baseline;
    if (b && (f.L / b.L < 0.6 || f.L / b.L > 1.6)) return 'moved';
    return null;
  }

  controlFrom(f, t) {
    const b = this.baseline;
    if (!b) return { x: 0, y: 0 };
    const k = this.settings.sensitivity ?? 1;
    let x = 0;
    let y = 0;
    if (this.side) {
      // Rocking forward (shoulders past the hands) = up.
      y = (f.fb - b.fb) / CONTROL_RANGE.sideFB;
    } else {
      // The raw camera image is not mirrored: moving to your right moves you to the image's left.
      x = -(f.cx - b.cx) / b.fs / CONTROL_RANGE.frontX;
      y = -(f.cy - b.cy) / b.fs / CONTROL_RANGE.frontY;
    }
    return {
      x: clamp(this.filterX.filter(x * k, t), -1.2, 1.2),
      y: clamp(this.filterY.filter(y * k, t), -1.2, 1.2),
    };
  }

  // Feed frames while the user gets into position. Returns progress 0..1;
  // at 1 the baseline is stored.
  calibrate(state, t, holdSeconds = 1.5) {
    if (!state.present || !state.ready) {
      this.calib = [];
      this.calibSince = null;
      return 0;
    }
    if (this.calibSince === null) this.calibSince = t;
    this.calib.push(state.f);
    while (this.calib.length > 90) this.calib.shift();
    // Restart the hold if the user is still moving.
    const recent = this.calib.slice(-20);
    const values = this.side ? recent.map((f) => f.fb) : recent.map((f) => f.cx / f.fs);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread > (this.side ? 0.05 : 0.3)) {
      this.calibSince = t;
      this.calib = this.calib.slice(-5);
    }
    const progress = Math.min(1, (t - this.calibSince) / holdSeconds);
    if (progress >= 1) {
      const keys = Object.keys(this.calib[0]).filter((k) => typeof this.calib[0][k] === 'number');
      const last = this.calib.slice(-30);
      this.baseline = Object.fromEntries(keys.map((k) => [k, median(last.map((f) => f[k]))]));
      this.filterX.reset();
      this.filterY.reset();
      this.formOk.force(true);
    }
    return progress;
  }
}
