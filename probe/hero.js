// Heroes of the probe and a small animation player for any KayKit Rig_Medium character.

import * as THREE from 'three';

// The free KayKit Adventurers 2.0 pack: five heroes, the rogue also comes with a hood.
export const HEROES = [
  { id: 'knight', name: 'Рыцарь', file: '3d/kaykit-adventurers/Knight.glb' },
  { id: 'barbarian', name: 'Варвар', file: '3d/kaykit-adventurers/Barbarian.glb' },
  { id: 'mage', name: 'Маг', file: '3d/kaykit-adventurers/Mage.glb' },
  { id: 'ranger', name: 'Следопыт', file: '3d/kaykit-adventurers/Ranger.glb' },
  {
    id: 'rogue',
    name: 'Разбойница',
    file: '3d/kaykit-adventurers/Rogue.glb',
    outfits: [
      { id: 'plain', name: 'Без капюшона', file: '3d/kaykit-adventurers/Rogue.glb' },
      { id: 'hood', name: 'В капюшоне', file: '3d/kaykit-adventurers/Rogue_Hooded.glb' },
    ],
  },
];

export const KEEPER_FILE = '3d/kaykit-skeletons/Skeleton_Warrior.glb';

// Loops crossfade into each other; a one-shot plays over the loop and hands back to it.
export class Actor {
  constructor(root, clips) {
    this.root = root;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.base = null;
    this.current = null;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this.base) this.fadeTo(this.base, 0.15);
    });
  }

  action(name) {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`no clip ${name}`);
    return this.mixer.clipAction(clip);
  }

  loop(name, fade = 0.25) {
    const next = this.action(name);
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    this.base = next;
    if (this.current !== next) this.fadeTo(next, fade);
  }

  // `then` names the loop that follows (sitting down is followed by sitting, not by running).
  once(name, { fade = 0.1, timeScale = 1, then } = {}) {
    if (then) {
      this.base = this.action(then);
      this.base.setLoop(THREE.LoopRepeat, Infinity);
    }
    const next = this.action(name);
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = timeScale;
    this.fadeTo(next, fade, true);
  }

  fadeTo(next, fade, restart = false) {
    const prev = this.current;
    if (prev === next && !restart) return;
    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(fade);
    next.play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = next;
  }

  // Jumps a loop to a given time; screenshots use it to freeze a readable pose.
  pose(name, time) {
    this.mixer.stopAllAction();
    const a = this.action(name);
    a.reset().play();
    a.time = time;
    this.current = a;
    this.base = a;
    this.mixer.update(0);
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
