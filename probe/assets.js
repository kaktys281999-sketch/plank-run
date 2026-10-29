// Loads the CC0 packs of the probe and prepares them for a phone: one shared Lambert material per
// texture atlas. One look on show (rule Ц2), so the pack's PBR materials are not kept.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = new URL('../assets/', import.meta.url);
const url = (path) => new URL(path, ROOT).href;

// KayKit Forest Nature Pack models copied into assets/3d/kaykit-forest (see assets/SOURCES.md).
export const FOREST = {
  trees: ['Tree_1_A', 'Tree_1_B', 'Tree_2_A', 'Tree_2_B', 'Tree_3_A', 'Tree_3_B', 'Tree_4_A', 'Tree_4_B'],
  bushes: ['Bush_1_C', 'Bush_2_B', 'Bush_3_B', 'Bush_4_C'],
  obstacles: ['Rock_1_D', 'Rock_1_E', 'Rock_2_C', 'Rock_3_E'],
  pebbles: ['Rock_2_A', 'Rock_2_B'],
  boulders: ['Rock_1_J', 'Rock_1_K', 'Rock_2_E', 'Rock_3_K', 'Rock_3_M'],
  grass: ['Grass_1_B', 'Grass_1_C', 'Grass_2_B'],
};

// Lambert keeps the pack's gradient atlas looking like the KayKit renders and is cheaper than
// the PBR material the glTF files carry.
function lambertFor(pbr, cache) {
  if (!cache.has(pbr)) {
    cache.set(pbr, new THREE.MeshLambertMaterial({
      name: pbr.name,
      map: pbr.map,
      color: pbr.color,
      emissive: pbr.emissive,
      emissiveMap: pbr.emissiveMap,
      emissiveIntensity: pbr.emissiveIntensity,
      transparent: pbr.transparent,
      opacity: pbr.opacity,
      alphaTest: pbr.alphaTest,
      side: pbr.side,
    }));
  }
  return cache.get(pbr);
}

export class Assets {
  constructor(manager) {
    this.loader = new GLTFLoader(manager);
    this.characters = new Map();
  }

  // Each forest .gltf points at the same forest_texture.png. Without the cache a phone would
  // decode that 1024² atlas once per model; with it the image is decoded once, and every mesh
  // then shares a single material, so the GPU holds one copy.
  async loadForest() {
    const names = Object.values(FOREST).flat();
    THREE.Cache.enabled = true;
    try {
      const scenes = await Promise.all(names.map((n) => this.loader.loadAsync(url(`3d/kaykit-forest/${n}_Color1.gltf`))));
      const cache = new Map();
      let shared = null;
      this.forest = new Map();
      scenes.forEach((gltf, i) => {
        const mesh = gltf.scene.getObjectByProperty('isMesh', true);
        shared ??= lambertFor(mesh.material, cache);
        const template = new THREE.Mesh(mesh.geometry, shared);
        template.name = names[i];
        template.castShadow = true;
        mesh.geometry.computeBoundingBox();
        this.forest.set(names[i], template);
      });
    } finally {
      THREE.Cache.clear();
      THREE.Cache.enabled = false;
    }
  }

  forestMesh(name) {
    return this.forest.get(name).clone();
  }

  async loadClips() {
    const gltf = await this.loader.loadAsync(url('3d/kaykit-animations/rig-medium-probe.glb'));
    this.clips = new Map();
    for (const clip of gltf.animations) {
      // The dodges carry the body half a step sideways; the run moves the hero itself, so the
      // root translation would add to it and snap back when the clip ends.
      if (clip.name.startsWith('Dodge_')) clip.tracks = clip.tracks.filter((t) => t.name !== 'root.position');
      this.clips.set(clip.name, clip);
    }
  }

  loadCharacter(path) {
    if (!this.characters.has(path)) {
      this.characters.set(path, this.loader.loadAsync(url(path)).then((gltf) => {
        const cache = new Map();
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          // Skinned bounds come from the bind pose and would cull a running arm.
          o.frustumCulled = false;
          o.material = lambertFor(o.material, cache);
        });
        return gltf.scene;
      }));
    }
    return this.characters.get(path);
  }

  // The Kenney star is an SVG, so it is rasterised once at sprite size instead of upscaling a 32 px PNG.
  async loadStarTexture() {
    const img = new Image();
    img.src = url('ui/kenney-ui-adventure/minimap_icon_star_yellow.svg');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    canvas.getContext('2d').drawImage(img, 0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
