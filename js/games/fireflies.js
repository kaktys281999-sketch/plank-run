// Fireflies: catch glowing bugs with a jar that follows your head/body (front camera, 2D).
// The plank is the real goal; the game keeps your eyes and mind busy while you hold it.
//
// World coords: x, y ∈ [-1, 1] (y up), mapped onto the area below the HUD.
// Fireflies wander slowly and fade out after a while, so you have to keep moving.

const TAU = Math.PI * 2;
const JAR_SIZE = 15;      // a full jar pays a bonus and empties
const COMBO_WINDOW = 3;   // seconds between catches to keep a streak

const TYPES = {
  normal: { points: 1, life: [6.5, 9], speed: [0.07, 0.14], size: 1, color: '#d8ff6a', rgb: '216, 255, 106' },
  gold: { points: 5, life: [3.5, 4.5], speed: [0.16, 0.24], size: 1.25, color: '#ffd25e', rgb: '255, 210, 94' },
  moon: { points: 20, life: [6, 7.5], speed: [0.05, 0.08], size: 1.6, color: '#a8e1ff', rgb: '168, 225, 255', gem: true },
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class FirefliesGame {
  constructor(canvas, { onEvent = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onEvent = onEvent;
    this.difficultyHorizon = 60;
    this.stars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: rand(0.4, 1.4), phase: rand(0, TAU) }));
    this.grass = Array.from({ length: 70 }, (_, i) => ({ x: (i + Math.random()) / 70, h: rand(0.04, 0.11), phase: rand(0, TAU) }));
    this.reset();
  }

  reset() {
    this.player = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.flies = [];
    this.particles = [];
    this.activeTime = 0;
    this.time = 0;
    this.score = 0;
    this.caught = 0;
    this.missed = 0;
    this.gems = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastCatch = -Infinity;
    this.jar = 0;
    this.jarFlash = 0;
    this.nextMoon = rand(18, 26);
  }

  setDifficultyHorizon(seconds) {
    this.difficultyHorizon = Math.max(30, seconds);
  }

  setInput({ x, y }) {
    this.target.x = clamp(x, -1, 1);
    this.target.y = clamp(y, -1, 1);
  }

  get level() {
    return Math.min(1, this.activeTime / this.difficultyHorizon);
  }

  // After a pause, nothing should vanish the instant you come back.
  resume() {
    for (const f of this.flies) f.life = Math.max(f.life, f.age + 1.5);
  }

  hint() {
    return 'Двигай головой и корпусом в любую сторону — лови светлячков банкой';
  }

  hudStats() {
    return [['Очки', this.score], ['Светлячки', this.caught]];
  }

  summary() {
    return [
      [this.score, 'очков'],
      [this.caught, 'светлячков поймано'],
      [this.gems, 'лунных камней'],
      [this.bestCombo, 'лучшая серия'],
    ];
  }

  spawn(type) {
    const t = TYPES[type];
    let x;
    let y;
    let tries = 0;
    // Far enough from the jar that catching it takes a real move.
    do {
      x = rand(-0.9, 0.9);
      y = rand(-0.85, 0.85);
    } while (Math.hypot(x - this.player.x, y - this.player.y) < 0.6 && ++tries < 12);
    this.flies.push({
      type, x, y,
      heading: rand(0, TAU),
      speed: rand(...t.speed) * (1 + 0.6 * this.level),
      age: 0,
      life: rand(...t.life) * (1 - 0.25 * this.level),
      phase: rand(0, TAU),
    });
  }

  update(dt, running) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const k = 1 - Math.exp(-10 * dt);
    this.player.x += (this.target.x - this.player.x) * k;
    this.player.y += (this.target.y - this.player.y) * k;
    this.jarFlash = Math.max(0, this.jarFlash - dt * 1.5);
    this.updateParticles(dt);
    if (!running) return;

    this.activeTime += dt;
    const want = Math.round(3 + 4 * this.level);
    while (this.flies.filter((f) => f.type !== 'moon').length < want) {
      this.spawn(Math.random() < 0.1 + 0.06 * this.level ? 'gold' : 'normal');
    }
    this.nextMoon -= dt;
    if (this.nextMoon <= 0) {
      this.spawn('moon');
      this.nextMoon = rand(25, 35);
    }

    const jar = this.toScreen(this.player);
    const jarR = this.jarRadius();
    const keep = [];
    for (const f of this.flies) {
      f.age += dt;
      f.heading += (Math.random() - 0.5) * 5 * dt;
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.y += Math.sin(f.heading) * f.speed * dt;
      if (Math.abs(f.x) > 0.95) { f.x = Math.sign(f.x) * 0.95; f.heading = Math.PI - f.heading; }
      if (Math.abs(f.y) > 0.9) { f.y = Math.sign(f.y) * 0.9; f.heading = -f.heading; }
      const p = this.toScreen(f);
      if (Math.hypot(p.x - jar.x, p.y - jar.y) < jarR * (1 + 0.25 * TYPES[f.type].size)) {
        this.catch(f);
      } else if (f.age > f.life) {
        this.missed += 1;
        this.burst(f, TYPES[f.type].rgb, 5, 0.4);
      } else {
        keep.push(f);
      }
    }
    this.flies = keep;
  }

  catch(f) {
    const t = TYPES[f.type];
    this.combo = this.activeTime - this.lastCatch < COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastCatch = this.activeTime;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = Math.min(3, 1 + Math.floor(this.combo / 5) * 0.5);
    this.score += Math.round(t.points * mult);
    this.caught += 1;
    if (t.gem) this.gems += 1;
    this.burst(f, t.rgb, f.type === 'normal' ? 12 : 24, 0.8);
    this.onEvent('catch', { type: f.type, combo: this.combo });
    this.jar += 1;
    if (this.jar >= JAR_SIZE) {
      this.jar = 0;
      this.score += 10;
      this.jarFlash = 1;
      this.burst(this.player, '216, 255, 106', 40, 1.2);
      this.onEvent('jar');
    }
  }

  burst(at, rgb, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.1, 0.5) * power;
      this.particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), rgb });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 0.15 * dt;
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
      this.background = null;
    }
    this.dpr = dpr;
    this.W = w;
    this.H = h;
  }

  // Play area sits below the HUD timer.
  area() {
    const { W, H } = this;
    return { x0: W * 0.06, x1: W * 0.94, y0: H * 0.24, y1: H * 0.9 };
  }

  toScreen({ x, y }) {
    const a = this.area();
    return { x: a.x0 + ((x + 1) / 2) * (a.x1 - a.x0), y: a.y1 - ((y + 1) / 2) * (a.y1 - a.y0) };
  }

  jarRadius() {
    const a = this.area();
    // Big enough to read from the floor at arm's length.
    return clamp(Math.min(a.x1 - a.x0, a.y1 - a.y0) * 0.1, 30, 80);
  }

  render() {
    this.resize();
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.background) this.background = this.paintBackground();
    ctx.drawImage(this.background, 0, 0, W, H);
    this.drawStars();
    this.drawGrass();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flies) this.drawFly(f);
    this.drawParticles();
    ctx.restore();
    this.drawJar();
  }

  paintBackground() {
    const { W, H, dpr } = this;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060818');
    sky.addColorStop(0.55, '#0e1638');
    sky.addColorStop(1, '#14243a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // Moon with a soft halo, kept below the HUD.
    const mx = W * 0.84;
    const my = this.area().y0 + H * 0.04;
    const mr = Math.min(W, H) * 0.045;
    const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
    halo.addColorStop(0, 'rgba(200, 220, 255, 0.25)');
    halo.addColorStop(1, 'rgba(200, 220, 255, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8eeff';
    g.beginPath();
    g.arc(mx, my, mr, 0, TAU);
    g.fill();
    // Two layers of hills.
    for (const [base, amp, color] of [[0.8, 0.05, '#0b1630'], [0.88, 0.04, '#081022']]) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        g.lineTo(x, H * base - Math.sin(x / W * 5 + base * 10) * H * amp);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    }
    return c;
  }

  drawStars() {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.time * 1.5 + s.phase);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawGrass() {
    const { ctx, W, H } = this;
    ctx.strokeStyle = '#06101c';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const b of this.grass) {
      const x = b.x * W;
      const sway = Math.sin(this.time * 1.2 + b.phase) * 6;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + sway * 0.5, H - b.h * H * 0.6, x + sway, H - b.h * H);
      ctx.stroke();
    }
  }

  drawFly(f) {
    const { ctx } = this;
    const t = TYPES[f.type];
    const p = this.toScreen(f);
    const r = this.jarRadius() * 0.2 * t.size;
    const fadeIn = Math.min(1, f.age / 0.4);
    const left = f.life - f.age;
    // Blink faster when about to fly away.
    const blink = left < 1.5 ? 0.5 + 0.5 * Math.sin(this.time * 18) : 0.75 + 0.25 * Math.sin(this.time * 4 + f.phase);
    const a = fadeIn * Math.min(1, left / 0.4) * blink;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
    glow.addColorStop(0, `rgba(${t.rgb}, ${0.55 * a})`);
    glow.addColorStop(1, `rgba(${t.rgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 240, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  }

  drawParticles() {
    const { ctx } = this;
    for (const pt of this.particles) {
      const p = this.toScreen(pt);
      ctx.fillStyle = `rgba(${pt.rgb}, ${Math.max(0, pt.life)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, TAU);
      ctx.fill();
    }
  }

  drawJar() {
    const { ctx } = this;
    const R = this.jarRadius();
    // Where your body points right now (the jar eases toward it).
    const t = this.toScreen(this.target);
    ctx.strokeStyle = 'rgba(216, 255, 106, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, R * 1.15, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const p = this.toScreen(this.player);
    const w = R * 1.3;
    const h = R * 1.6;
    const x = p.x - w / 2;
    const y = p.y - h / 2 + R * 0.1;
    const fill = this.jar / JAR_SIZE;
    // Inner light grows as the jar fills.
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 2.2);
    glow.addColorStop(0, `rgba(216, 255, 106, ${0.12 + 0.35 * fill + 0.5 * this.jarFlash})`);
    glow.addColorStop(1, 'rgba(216, 255, 106, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 2.2, 0, TAU);
    ctx.fill();
    // Glass body.
    ctx.fillStyle = 'rgba(190, 220, 255, 0.12)';
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.28);
    ctx.fill();
    ctx.stroke();
    // Lid.
    ctx.fillStyle = '#c9a46a';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.12, y - h * 0.14, w * 0.76, h * 0.16, 4);
    ctx.fill();
    // Caught fireflies dancing inside.
    for (let i = 0; i < this.jar; i++) {
      const a = this.time * 2 + i * 2.4;
      const fx = p.x + Math.cos(a) * w * 0.28 * Math.sin(i * 1.7 + 1);
      const fy = y + h * 0.6 + Math.sin(a * 1.3) * h * 0.25;
      ctx.fillStyle = 'rgba(230, 255, 150, 0.95)';
      ctx.beginPath();
      ctx.arc(fx, fy, 2.4, 0, TAU);
      ctx.fill();
    }
    // Highlight.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.2);
    ctx.lineTo(x + w * 0.2, y + h * 0.65);
    ctx.stroke();
  }
}
