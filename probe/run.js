// The 30-second run of the probe. Three lanes, stars to collect, rocks to step around.
// It is not the game (the «Дорожки» engine of spec-games-v2 is written from scratch); it only has
// to look and move like one, so the owner can judge the look and the frame rate.

import * as THREE from 'three';
import { LANE_X } from './world.js';
import { FOREST } from './assets.js';

export const RUN_SECONDS = 30;
export const RUN_SPEED = 7; // units per second, so the lanes show about 2.5 s ahead (spec-games-v2 §2.2)
const SPAWN_Z = -52;
const ROW_GAP = 7; // one decision per second
const STAR_Y = 1.2;
// Lines stay shorter than ROW_GAP, so a star line never runs into the next row's rock.
const STAR_GAP = 1.7;
const LANES = [-1, 0, 1];

const laneOf = (x) => Math.max(-1, Math.min(1, Math.round(x / LANE_X)));

export class Run {
  constructor(world, assets, starTexture, rng) {
    this.world = world;
    this.rng = rng;
    this.group = new THREE.Group();
    world.runGroup.add(this.group);
    this.stars = [];
    for (let i = 0; i < 48; i++) {
      const obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture, transparent: true, depthWrite: false }));
      obj.visible = false;
      this.group.add(obj);
      this.stars.push({ obj, active: false, taken: false, pop: 0 });
    }
    this.rocks = [];
    for (let i = 0; i < 14; i++) {
      const obj = assets.forestMesh(FOREST.obstacles[i % FOREST.obstacles.length]);
      obj.visible = false;
      this.group.add(obj);
      this.rocks.push({ obj, active: false, hit: false });
    }
    this.actor = null;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.dist = 0;
    this.nextRow = 16;
    this.lane = 0;
    this.heroX = 0;
    this.starsTaken = 0;
    this.rocksHit = 0;
    this.botCooldown = 0;
    this.done = false;
    for (const p of [...this.stars, ...this.rocks]) this.free(p);
  }

  start({ bot, actor }) {
    this.reset();
    this.bot = bot;
    this.actor = actor;
  }

  free(p) {
    p.active = false;
    p.obj.visible = false;
  }

  take(pool) {
    const p = pool.find((q) => !q.active);
    if (!p) return null;
    p.active = true;
    p.obj.visible = true;
    return p;
  }

  starLine(lane, z, n) {
    for (let k = 0; k < n; k++) {
      const s = this.take(this.stars);
      if (!s) return;
      s.taken = false;
      s.pop = 0;
      s.obj.material.opacity = 1;
      s.obj.scale.setScalar(0.95);
      s.obj.position.set(lane * LANE_X, STAR_Y, z - k * STAR_GAP);
    }
  }

  rock(lane, z) {
    const r = this.take(this.rocks);
    if (!r) return;
    r.hit = false;
    r.obj.position.set(lane * LANE_X, 0, z);
    r.obj.rotation.y = this.rng() * Math.PI * 2;
  }

  // Rows are laid out by distance, not by frames, so the course is the same on any phone.
  spawnRows() {
    while (this.nextRow - this.dist <= -SPAWN_Z) {
      if (this.nextRow < RUN_SECONDS * RUN_SPEED - 6) this.spawnRow(-(this.nextRow - this.dist), this.nextRow / RUN_SPEED);
      this.nextRow += ROW_GAP;
    }
  }

  spawnRow(z, at) {
    const rng = this.rng;
    const any = () => LANES[Math.floor(rng() * 3)];
    if (at < 3) return this.starLine(0, z, 4);
    const r = rng();
    if (r < 0.3) return this.starLine(any(), z, 4);
    if (r < 0.75 || at < 9) {
      const blocked = any();
      this.rock(blocked, z);
      const open = LANES.filter((l) => l !== blocked);
      return this.starLine(open[Math.floor(rng() * 2)], z - 1.2, 3);
    }
    // Two rocks leave one lane open, and that lane always has stars.
    const open = any();
    for (const l of LANES) if (l !== open) this.rock(l, z);
    this.starLine(open, z, 3);
  }

  move(dir) {
    if (this.done) return;
    const lane = Math.max(-1, Math.min(1, this.lane + dir));
    if (lane === this.lane) return;
    this.lane = lane;
    // The hero faces away from the camera, so screen left is the hero's own left.
    this.actor?.once(dir < 0 ? 'Dodge_Left' : 'Dodge_Right', { fade: 0.08 });
  }

  // The demo bot looks about two seconds ahead, like a person, goes for stars and never steps
  // into a lane with a rock close ahead. It runs alone so the owner can watch from the floor.
  think(dt) {
    this.botCooldown -= dt;
    if (this.botCooldown > 0) return;
    const horizon = RUN_SPEED * 2.2;
    const score = { '-1': 0, 0: 0, 1: 0 };
    for (const s of this.stars) {
      if (!s.active || s.taken) continue;
      const d = -s.obj.position.z;
      if (d > -0.3 && d < horizon) score[laneOf(s.obj.position.x)] += 1 + 2 * (1 - d / horizon);
    }
    for (const r of this.rocks) {
      if (!r.active || r.hit) continue;
      const d = -r.obj.position.z;
      if (d > -0.8 && d < horizon) score[laneOf(r.obj.position.x)] -= d < RUN_SPEED * 1.1 ? 100 : 4;
    }
    score[this.lane] += 0.6;
    let best = this.lane;
    for (const l of LANES) if (score[l] > score[best] + 0.01) best = l;
    if (best === this.lane) return;
    const step = this.lane + Math.sign(best - this.lane);
    if (score[step] < -50) return;
    this.move(step - this.lane);
    this.botCooldown = 0.3;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const dz = RUN_SPEED * dt;
    this.dist += dz;
    this.world.scroll(dz);
    this.spawnRows();
    if (this.bot) this.think(dt);
    this.heroX += (this.lane * LANE_X - this.heroX) * (1 - Math.exp(-dt * 12));
    if (this.actor) this.actor.root.position.x = this.heroX;
    this.world.blob.position.x = this.heroX;
    this.world.followX = this.heroX * 0.5;

    for (const s of this.stars) {
      if (!s.active) continue;
      const o = s.obj;
      o.position.z += dz;
      if (s.taken) {
        s.pop += dt;
        const k = Math.min(1, s.pop / 0.25);
        o.scale.setScalar(0.95 * (1 + k * 0.8));
        o.material.opacity = 1 - k;
        o.position.y += dt * 2.5;
        if (k >= 1) this.free(s);
        continue;
      }
      o.position.y = STAR_Y + Math.sin(this.t * 5 + o.position.z * 0.5) * 0.1;
      if (Math.abs(o.position.z) < 0.7 && Math.abs(o.position.x - this.heroX) < 0.8) {
        s.taken = true;
        this.starsTaken++;
      } else if (o.position.z > 0.8) {
        // A missed star fades behind the hero instead of swelling in front of the camera.
        o.material.opacity = Math.max(0, 1 - (o.position.z - 0.8) / 0.8);
        if (o.material.opacity <= 0) this.free(s);
      }
    }
    for (const r of this.rocks) {
      if (!r.active) continue;
      const o = r.obj;
      o.position.z += dz;
      if (!r.hit && Math.abs(o.position.z) < 0.55 && Math.abs(o.position.x - this.heroX) < 0.75) {
        r.hit = true;
        this.rocksHit++;
        this.actor?.once('Hit_A', { fade: 0.06 });
        this.world.shake(0.25);
      }
      // A passed rock sinks under the grass instead of looming at the bottom of the screen.
      o.position.y = o.position.z > 0.5 ? -(o.position.z - 0.5) * 2.2 : 0;
      if (o.position.z > 2) this.free(r);
    }
    if (this.t >= RUN_SECONDS) this.done = true;
  }
}
