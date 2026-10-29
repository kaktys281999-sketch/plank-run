// Renderer, light, sky, the forest along the track and the arena of the look probe
// (spec-visual-v2 §5 and §9). The hero stays at z = 0 and the forest moves toward the camera,
// so numbers never grow during a run.

import * as THREE from 'three';
import { COLORS } from './palette.js';
import { FOREST } from './assets.js';

export const LANE_X = 1.5;
export const TRACK_HALF = LANE_X * 1.5 + 0.4;
const CHUNK_LEN = 12;
const CHUNKS = 6;
const RECYCLE_Z = 21;

// Camera poses. `half` is how many world units must stay visible left and right of the hero,
// so the three lanes fit a portrait phone; the field of view follows the screen shape.
// `wide` replaces pos and target on a landscape screen, where the same framing looks too high.
export const POSES = {
  pick: { pos: [0, 1.75, 7.2], target: [0, 0.3, 0], half: 1.9, minFov: 34, wide: { pos: [0, 1.9, 10], target: [0, 0.64, 0] } },
  // High enough that the horizon sits in the top quarter and the hero in the bottom third.
  run: { pos: [0, 6.0, 5.5], target: [0, 0.8, -8.6], half: 2.75, minFov: 46, wide: { pos: [0, 4.3, 7.4], target: [0, 1.2, -9] } },
  arena: { pos: [0.6, 3.4, 9.2], target: [0, 0.25, 0], half: 3.4, minFov: 40, wide: { pos: [0.8, 3.0, 9.6], target: [-0.1, 1.35, -0.4] } },
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export class World {
  constructor(canvas, rng) {
    this.rng = rng;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.dprCap = 2;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(COLORS.skyBottom, 30, 64);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 80);
    this.pose = null;
    this.tween = null;
    this.shakeLeft = 0;
    // The run camera drifts half way toward the hero's lane, as runners do.
    this.followX = 0;
    this.addSky();
    this.addLights();
    this.addGround();
    this.runGroup = new THREE.Group();
    this.arenaGroup = new THREE.Group();
    this.arenaGroup.visible = false;
    this.scene.add(this.runGroup, this.arenaGroup);
    this.chunks = [];
    this.setPose('pick');
  }

  addSky() {
    // A dome tied to world height keeps the horizon the fog colour wherever the camera looks.
    const geo = new THREE.SphereGeometry(70, 24, 12);
    const top = new THREE.Color(COLORS.skyTop);
    const bottom = new THREE.Color(COLORS.skyBottom);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / 70) * 2.2);
      c.copy(bottom).lerp(top, Math.pow(t, 0.8)).toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  addLights() {
    // Sand, not grass, as the bounce colour: green bounce turned the knight's steel olive.
    this.hemi = new THREE.HemisphereLight(COLORS.skyBottom, COLORS.sand, 2.1);
    // Warm sun from the upper left, as the prompts for the backdrops ask (spec-visual-v2 §8).
    this.sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
    this.sun.position.set(-7, 13, 6);
    this.sun.target.position.set(0, 0, -5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -11;
    cam.right = 11;
    cam.top = 11;
    cam.bottom = -11;
    cam.near = 1;
    cam.far = 45;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  addGround() {
    const lam = (color) => new THREE.MeshLambertMaterial({ color });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), lam(COLORS.grass));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -40;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.track = new THREE.Group();
    const strip = (width, color, x, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, 150), lam(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, -55);
      m.receiveShadow = true;
      this.track.add(m);
    };
    strip(TRACK_HALF * 2, COLORS.sand, 0, 0.02);
    for (const s of [-1, 1]) {
      strip(0.24, COLORS.sandEdge, s * (TRACK_HALF - 0.12), 0.035);
      strip(0.07, COLORS.sandLine, s * LANE_X * 0.5, 0.035);
    }
    this.scene.add(this.track);

    // Soft spot under the hero for when real shadows are off on a weak phone (spec-visual-v2 §5).
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, fog: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.05;
    this.blob.visible = false;
    this.scene.add(this.blob);
  }

  // Forest slices along the track. Each slice keeps its models and only gets new places when it
  // comes round again, so a run allocates nothing.
  buildForest(assets) {
    const rng = this.rng;
    for (let i = 0; i < CHUNKS; i++) {
      const group = new THREE.Group();
      group.position.z = RECYCLE_Z - 1 - i * CHUNK_LEN;
      const items = [];
      const add = (kind, name) => {
        const mesh = assets.forestMesh(name);
        mesh.receiveShadow = kind === 'pebble';
        group.add(mesh);
        items.push({ kind, mesh });
      };
      for (let k = 0; k < 4; k++) add('tree', pick(rng, FOREST.trees));
      for (let k = 0; k < 2; k++) add('bush', pick(rng, FOREST.bushes));
      for (let k = 0; k < 6; k++) add('grass', pick(rng, FOREST.grass));
      for (let k = 0; k < 2; k++) add('pebble', pick(rng, FOREST.pebbles));
      add('boulder', pick(rng, FOREST.boulders));
      const chunk = { group, items };
      this.dress(chunk);
      this.chunks.push(chunk);
      this.runGroup.add(group);
    }
  }

  dress(chunk) {
    const rng = this.rng;
    chunk.items.forEach((item, idx) => {
      const side = idx % 2 ? 1 : -1;
      const m = item.mesh;
      const z = -rng() * CHUNK_LEN;
      let x;
      let s = 1;
      if (item.kind === 'tree') {
        x = side * (TRACK_HALF + 2.2 + rng() * 7);
        s = 0.85 + rng() * 0.4;
      } else if (item.kind === 'bush') {
        x = side * (TRACK_HALF + 1 + rng() * 2);
        s = 0.8 + rng() * 0.4;
      } else if (item.kind === 'grass') {
        x = side * (TRACK_HALF + 0.25 + rng() * 3.5);
        s = 0.9 + rng() * 0.5;
      } else if (item.kind === 'pebble') {
        // Small and just off the sand, so nobody takes them for the rocks to dodge.
        x = side * (TRACK_HALF + 0.15 + rng() * 0.45);
        s = 0.5 + rng() * 0.4;
      } else {
        x = side * (TRACK_HALF + 6 + rng() * 6);
        s = 0.7 + rng() * 0.5;
        m.visible = rng() < 0.55;
      }
      m.position.set(x, 0, z);
      m.rotation.y = rng() * Math.PI * 2;
      m.scale.setScalar(s);
    });
  }

  scroll(dz) {
    for (const chunk of this.chunks) {
      chunk.group.position.z += dz;
      if (chunk.group.position.z > RECYCLE_Z) {
        chunk.group.position.z -= CHUNKS * CHUNK_LEN;
        this.dress(chunk);
      }
    }
  }

  // A sand clearing ringed by rocks and trees. The side facing the camera stays open.
  buildArena(assets) {
    const rng = this.rng;
    const lam = (color) => new THREE.MeshLambertMaterial({ color });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6.6, 48), lam(COLORS.sand));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.95, 48), lam(COLORS.sandEdge));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.035;
    rim.receiveShadow = true;
    this.arenaGroup.add(floor, rim);

    // Angles measured from +x toward -z; the camera sits near -40°, so that sector is skipped.
    const place = (name, angle, radius, scale) => {
      const m = assets.forestMesh(name);
      const a = THREE.MathUtils.degToRad(angle);
      m.position.set(Math.cos(a) * radius, 0, -Math.sin(a) * radius);
      m.rotation.y = rng() * Math.PI * 2;
      m.scale.setScalar(scale);
      this.arenaGroup.add(m);
      return m;
    };
    const boulders = FOREST.boulders;
    [20, 55, 88, 120, 150, 185, 215].forEach((a, i) => place(boulders[i % boulders.length], a, 8.2 + rng() * 1.2, 0.75 + rng() * 0.35));
    [0, 32, 66, 100, 135, 165, 200, 232, 262].forEach((a, i) => place(FOREST.trees[i % FOREST.trees.length], a + rng() * 10, 12 + rng() * 5, 0.9 + rng() * 0.35));
    [10, 70, 140, 190, 240].forEach((a, i) => place(FOREST.bushes[i % FOREST.bushes.length], a, 7.4 + rng(), 0.9));
    for (let i = 0; i < 10; i++) place(pick(rng, FOREST.grass), 300 + rng() * 120, 7 + rng() * 2.5, 1);
  }

  showRun() {
    this.runGroup.visible = true;
    this.track.visible = true;
    this.arenaGroup.visible = false;
  }

  showArena() {
    this.runGroup.visible = false;
    this.track.visible = false;
    this.arenaGroup.visible = true;
  }

  setPose(name, duration = 0) {
    this.poseName = name;
    const p = POSES[name];
    const view = p.wide && this.camera.aspect > 1 ? p.wide : p;
    const to = { pos: new THREE.Vector3(...view.pos), target: new THREE.Vector3(...view.target), half: p.half, minFov: p.minFov };
    if (duration > 0 && this.pose) {
      this.tween = { from: this.pose, to, t: 0, duration };
    } else {
      this.pose = to;
      this.tween = null;
    }
    this.applyCamera();
  }

  shake(seconds = 0.25) {
    this.shakeLeft = seconds;
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.blob.visible = !on;
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  setDprCap(cap) {
    this.dprCap = cap;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    if (this.poseName && !this.tween) this.setPose(this.poseName);
    this.applyCamera();
  }

  applyCamera() {
    const p = this.pose;
    if (!p) return;
    const cam = this.camera;
    cam.position.copy(p.pos);
    if (this.shakeLeft > 0) {
      const k = this.shakeLeft * 0.35;
      cam.position.x += (this.rng() - 0.5) * k;
      cam.position.y += (this.rng() - 0.5) * k;
    }
    cam.position.x += this.followX;
    cam.lookAt(p.target.x + this.followX, p.target.y, p.target.z);
    // Field of view that keeps `half` units visible at the hero (z = 0) on a narrow screen.
    const dist = Math.max(1, p.pos.distanceTo(new THREE.Vector3(0, p.target.y, 0)));
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(p.half / (dist * cam.aspect)));
    cam.fov = THREE.MathUtils.clamp(fov, p.minFov, 78);
    cam.updateProjectionMatrix();
    this.sky.position.copy(cam.position);
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
      this.pose = {
        pos: tw.from.pos.clone().lerp(tw.to.pos, e),
        target: tw.from.target.clone().lerp(tw.to.target, e),
        half: THREE.MathUtils.lerp(tw.from.half, tw.to.half, e),
        minFov: THREE.MathUtils.lerp(tw.from.minFov, tw.to.minFov, e),
      };
      if (tw.t >= 1) {
        this.pose = tw.to;
        this.tween = null;
      }
    }
    if (this.shakeLeft > 0) this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    this.applyCamera();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
