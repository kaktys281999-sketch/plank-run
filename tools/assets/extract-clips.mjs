#!/usr/bin/env node
// Packs selected animation clips from several KayKit rig files into one small .glb.
//
// Why: each Rig_Medium_*.glb of the Character Animations pack weighs 0.7-1.5 MB and holds
// 11-29 clips plus a mannequin mesh. A game needs a dozen clips, so a phone would download
// ~4 MB to use ~10% of it. The output keeps the skeleton nodes (names only matter: three.js
// binds tracks to bones by name) and the chosen animations, nothing else.
//
// Usage:
//   node tools/assets/extract-clips.mjs out.glb Rig_Medium_General.glb:Idle_A,Hit_A Rig_Medium_MovementBasic.glb:Running_A
// The first input gives the node tree. Clips from other inputs are remapped by bone name,
// so every input must share the same rig (all KayKit Rig_Medium files do).

import { readFileSync, writeFileSync } from 'node:fs';

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a .glb`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return { json, bin };
}

function main() {
  const [out, ...specs] = process.argv.slice(2);
  if (!out || !specs.length) {
    console.error('usage: extract-clips.mjs out.glb in.glb:Clip,Clip [in2.glb:Clip ...]');
    process.exit(2);
  }

  const parts = [];
  const accessors = [];
  const bufferViews = [];
  let bodyLength = 0;

  // Copies one accessor into the new binary body, de-interleaving if the source had a stride.
  function copyAccessor(src, index) {
    const acc = src.json.accessors[index];
    if (acc.sparse) throw new Error('sparse accessors are not supported');
    const view = src.json.bufferViews[acc.bufferView];
    const elementBytes = COMPONENT_BYTES[acc.componentType] * TYPE_COMPONENTS[acc.type];
    const stride = view.byteStride ?? elementBytes;
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const data = Buffer.alloc(elementBytes * acc.count);
    for (let i = 0; i < acc.count; i++) {
      src.bin.copy(data, i * elementBytes, start + i * stride, start + i * stride + elementBytes);
    }
    const pad = (4 - (bodyLength % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
    bodyLength += pad;
    bufferViews.push({ buffer: 0, byteOffset: bodyLength, byteLength: data.length });
    parts.push(data);
    bodyLength += data.length;
    const copy = { bufferView: bufferViews.length - 1, componentType: acc.componentType, count: acc.count, type: acc.type };
    if (acc.normalized) copy.normalized = true;
    if (acc.min) copy.min = acc.min;
    if (acc.max) copy.max = acc.max;
    accessors.push(copy);
    return accessors.length - 1;
  }

  let base = null;
  const animations = [];
  for (const spec of specs) {
    const sep = spec.lastIndexOf(':');
    const path = spec.slice(0, sep);
    const wanted = spec.slice(sep + 1).split(',').filter(Boolean);
    const src = readGlb(path);
    if (!base) base = src;
    const nodeByName = new Map(base.json.nodes.map((n, i) => [n.name, i]));
    const accessorMap = new Map();
    for (const name of wanted) {
      const anim = (src.json.animations ?? []).find((a) => a.name === name);
      if (!anim) throw new Error(`${path}: no clip named ${name}`);
      const samplers = anim.samplers.map((s) => {
        for (const key of ['input', 'output']) {
          if (!accessorMap.has(s[key])) accessorMap.set(s[key], copyAccessor(src, s[key]));
        }
        return { input: accessorMap.get(s.input), output: accessorMap.get(s.output), interpolation: s.interpolation ?? 'LINEAR' };
      });
      const channels = [];
      for (const c of anim.channels) {
        const nodeName = src.json.nodes[c.target.node]?.name;
        const node = nodeByName.get(nodeName);
        // Tracks for nodes the base rig lacks (the mannequin mesh holder) are dropped.
        if (node == null) continue;
        channels.push({ sampler: c.sampler, target: { node, path: c.target.path } });
      }
      animations.push({ name, samplers, channels });
    }
  }

  const nodes = base.json.nodes.map((n) => {
    const keep = { name: n.name };
    for (const key of ['children', 'translation', 'rotation', 'scale', 'matrix']) if (n[key]) keep[key] = n[key];
    return keep;
  });
  const sceneDef = base.json.scenes[base.json.scene ?? 0];
  const json = {
    asset: { version: '2.0', generator: 'plank-run tools/assets/extract-clips.mjs' },
    scene: 0,
    scenes: [{ nodes: sceneDef.nodes }],
    nodes,
    animations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bodyLength }],
  };

  let jsonChunk = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
  jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(jsonPad, 0x20)]);
  let binChunk = Buffer.concat(parts);
  const binPad = (4 - (binChunk.length % 4)) % 4;
  binChunk = Buffer.concat([binChunk, Buffer.alloc(binPad)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binChunk.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  writeFileSync(out, Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]));
  console.log(`${out}: ${animations.length} clips, ${nodes.length} nodes, ${Math.round(total / 1024)} KB`);
}

main();
