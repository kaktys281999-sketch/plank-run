// Tunnel: fly through gates by moving your body.
// Deliberately slow and forgiving: pose input has ~150–250 ms of latency
// (camera + inference + smoothing), so reflex-heavy gameplay would feel unfair.
//
// World model: the player sits at depth d = 0 and moves along one axis u ∈ [-1, 1].
// Gates and coins spawn at d = 1 and travel toward the player.
// axis 'x' renders as a top-down tunnel (steer left/right),
// axis 'y' renders as a side-scroller (steer up/down).

const PLAYER_R = 0.09;
const COIN_HIT = 0.16;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class TunnelGame {
  constructor(canvas, { axis = 'x', onEvent = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.axis = axis;
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.player = 0;
    this.target = 0;
    this.items = [];
    this.particles = [];
    this.nextSpawn = 0.55;
    this.nextSpawnSpacing = 0.55;
    this.lastGateU = 0;
    this.activeTime = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.coins = 0;
    this.passed = 0;
    this.hits = 0;
    this.flash = 0;
    this.scroll = 0;
    this.difficultyHorizon = 60;
  }

  setDifficultyHorizon(seconds) {
    this.difficultyHorizon = Math.max(30, seconds);
  }

  setInput({ x, y }) {
    this.target = clamp(this.axis === 'x' ? x : y, -1, 1);
  }

  hint(camera) {
    if (this.axis === 'x') return 'Смещай корпус влево и вправо, чтобы попасть в ворота';
    return camera === 'side' ? 'Качнись вперёд — шар вверх, назад — вниз' : 'Поднимай и опускай корпус, чтобы попасть в ворота';
  }

  hudStats() {
    return [['Очки', this.score], ['Монеты', this.coins]];
  }

  summary() {
    return [
      [this.score, 'очков'],
      [this.coins, 'монет'],
      [`${this.passed} / ${this.passed + this.hits}`, 'ворот пройдено'],
      [this.bestCombo, 'лучшая серия'],
    ];
  }

  get level() {
    return Math.min(1, this.activeTime / this.difficultyHorizon);
  }

  get speed() {
    return 0.3 + 0.17 * this.level; // depth units per second; 1/speed = seconds of look-ahead
  }

  // After a pause the next gate must not be right in your face.
  resume() {
    const next = this.items.filter((i) => i.type === 'gate' && i.d > 0).sort((a, b) => a.d - b.d)[0];
    if (next && next.d < 0.5) {
      const shift = 0.5 - next.d;
      this.items.forEach((i) => { i.d += shift; });
      this.nextSpawn += shift;
    }
  }

  spawn() {
    const lvl = this.level;
    const halfGap = 0.44 - 0.14 * lvl;
    const maxDelta = 0.6 + 0.45 * lvl;
    const limit = 1 - halfGap * 0.8;
    const u = clamp(this.lastGateU + rand(-maxDelta, maxDelta), -limit, limit);
    // Coins on a straight path from the previous gate to this one.
    for (let k = 1; k <= 3; k++) {
      const f = k / 4;
      this.items.push({ type: 'coin', d: 1 + this.nextSpawnSpacing * (f - 1), u: this.lastGateU + (u - this.lastGateU) * f, done: false });
    }
    this.items.push({ type: 'gate', d: 1, u, h: halfGap, done: false });
    this.lastGateU = u;
    this.nextSpawnSpacing = 0.62 - 0.12 * lvl;
    this.nextSpawn = this.nextSpawnSpacing;
  }

  update(dt, running) {
    dt = Math.min(dt, 0.05);
    // The ball eases toward the body-controlled target (pure visual smoothing).
    this.player += (this.target - this.player) * (1 - Math.exp(-12 * dt));
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.updateParticles(dt);
    if (!running) return;

    this.activeTime += dt;
    const step = this.speed * dt;
    this.scroll += step;
    this.nextSpawn -= step;
    if (this.nextSpawn <= 0) this.spawn();

    for (const it of this.items) {
      const prev = it.d;
      it.d -= step;
      if (it.done || prev <= 0 || it.d > 0) continue;
      it.done = true;
      if (it.type === 'gate') {
        if (Math.abs(this.player - it.u) <= it.h - PLAYER_R * 0.6) {
          this.combo += 1;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.passed += 1;
          this.score += 10 + 5 * Math.min(this.combo, 10);
          it.result = 'pass';
          this.burst(this.player, '#5ef2c2', 14);
          this.onEvent('pass', this.combo);
        } else {
          this.combo = 0;
          this.hits += 1;
          this.flash = 1;
          it.result = 'hit';
          this.burst(this.player, '#ff5d7a', 22);
          this.onEvent('hit');
        }
      } else if (Math.abs(this.player - it.u) < COIN_HIT) {
        this.coins += 1;
        this.score += 5;
        it.result = 'got';
        this.burst(it.u, '#ffd25e', 8);
        this.onEvent('coin');
      }
    }
    this.items = this.items.filter((i) => i.d > -0.2);
  }

  burst(u, color, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ u, d: 0, vu: rand(-0.8, 0.8), vd: rand(-0.5, 0.6), life: rand(0.4, 0.8), color });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.u += p.vu * dt;
      p.d += p.vd * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---------- rendering ----------

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.W = w;
    this.H = h;
  }

  // (u, d) -> screen {x, y, s}; s = perspective scale for sizes.
  project(u, d) {
    const { W, H } = this;
    if (this.axis === 'x') {
      const horizonY = H * 0.12;
      const playerY = H * 0.8;
      const half = Math.min(W * 0.46, H * 0.55);
      const s = 1 / (1 + Math.max(d, -0.15) * 2.4);
      const sEnd = 1 / (1 + 2.4);
      const k = (s - sEnd) / (1 - sEnd);
      return { x: W / 2 + u * half * s, y: horizonY + (playerY - horizonY) * k, s, half };
    }
    // Keep the band below the HUD (timer) so gates are never hidden behind it.
    const playerX = W * 0.22;
    const half = H * 0.32;
    return { x: playerX + d * (W * 0.98 - playerX), y: H * 0.6 - u * half, s: 1, half };
  }

  render(colors) {
    this.resize();
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawTrack(colors);
    const sorted = [...this.items].sort((a, b) => b.d - a.d);
    for (const it of sorted) {
      if (it.type === 'gate') this.drawGate(it, colors);
      else if (!it.result) this.drawCoin(it, colors);
    }
    this.drawParticles();
    this.drawPlayer(colors);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 70, 100, ${this.flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawTrack(c) {
    const { ctx } = this;
    ctx.lineWidth = 2;
    if (this.axis === 'x') {
      const a = this.project(-1, 1);
      const b = this.project(1, 1);
      const p = this.project(-1, -0.15);
      const q = this.project(1, -0.15);
      ctx.fillStyle = c.track;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
      // Moving cross lines give a sense of speed.
      ctx.strokeStyle = c.grid;
      for (let i = 0; i < 12; i++) {
        const d = 1 - ((i / 12 + this.scroll * 2) % 1) * 1.15;
        const l = this.project(-1, d);
        const r = this.project(1, d);
        ctx.globalAlpha = 0.25 + 0.5 * (1 - Math.max(0, d));
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 3;
      for (const u of [-1, 1]) {
        const far = this.project(u, 1);
        const near = this.project(u, -0.15);
        ctx.beginPath();
        ctx.moveTo(far.x, far.y);
        ctx.lineTo(near.x, near.y);
        ctx.stroke();
      }
    } else {
      const top = this.project(1, 0).y;
      const bottom = this.project(-1, 0).y;
      ctx.fillStyle = c.track;
      ctx.fillRect(0, top, this.W, bottom - top);
      ctx.strokeStyle = c.grid;
      for (let i = 0; i < 14; i++) {
        const d = 1 - ((i / 14 + this.scroll * 2) % 1) * 1.3;
        const x = this.project(0, d).x;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 3;
      for (const y of [top, bottom]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.W, y);
        ctx.stroke();
      }
    }
  }

  drawGate(g, c) {
    const { ctx } = this;
    const color = g.result === 'hit' ? c.hit : g.result === 'pass' ? c.pass : c.gate;
    const alpha = g.d < 0 ? Math.max(0, 1 + g.d * 6) : Math.min(1, (1 - g.d) * 5);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    if (this.axis === 'x') {
      const p = this.project(0, g.d);
      const thick = Math.max(4, 26 * p.s);
      for (const [u0, u1] of [[-1, g.u - g.h], [g.u + g.h, 1]]) {
        if (u1 <= u0) continue;
        const a = this.project(u0, g.d);
        const b = this.project(u1, g.d);
        ctx.fillRect(a.x, a.y - thick / 2, b.x - a.x, thick);
      }
    } else {
      const thick = 28;
      for (const [u0, u1] of [[-1, g.u - g.h], [g.u + g.h, 1]]) {
        if (u1 <= u0) continue;
        const a = this.project(u1, g.d);
        const b = this.project(u0, g.d);
        ctx.fillRect(a.x - thick / 2, a.y, thick, b.y - a.y);
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  drawCoin(it, c) {
    const { ctx } = this;
    const p = this.project(it.u, it.d);
    const r = Math.max(3, p.half * 0.05 * p.s);
    ctx.globalAlpha = Math.min(1, (1 - it.d) * 5);
    ctx.fillStyle = c.coin;
    ctx.shadowColor = c.coin;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  drawParticles() {
    const { ctx } = this;
    for (const pt of this.particles) {
      const p = this.project(pt.u, pt.d);
      ctx.globalAlpha = Math.max(0, pt.life * 1.5);
      ctx.fillStyle = pt.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(c) {
    const { ctx } = this;
    const p = this.project(this.player, 0);
    const r = p.half * PLAYER_R;
    // Ghost marker shows where your body is pointing right now.
    const t = this.project(this.target, 0);
    ctx.strokeStyle = c.player;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, c.player);
    ctx.fillStyle = grad;
    ctx.shadowColor = c.player;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
