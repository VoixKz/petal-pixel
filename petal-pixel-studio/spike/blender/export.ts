// Writes a name's finished plant as plain meshes, from the engine's own numbers.
// npx vite-node spike/blender/export.ts <out dir> Anna Maria ...
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { poseOf } from "@/components/flower/blossom/crossing";
import { leafGeometry } from "@/components/flower/blossom/leaf";
import { heartColour } from "@/components/flower/blossom/material";
import { buildBlossom, PART_KIND, type Blossom, type Part } from "@/math/blossom/build";
import { seedOf } from "@/math/blossom/name";
import { emptyPath, emptyTube, placeAt, traceStem, tubeIndex, writeLeaves, writeThorns, writeTube } from "@/math/blossom/stem";

const [out, ...names] = process.argv.slice(2);
const LIFE = 1;
const COLS = 44;
const ROWS = 72;

interface Built { name: string; material: string; positions: number[]; indices: number[]; colours?: number[]; grid?: number[]; flat?: boolean }
const rgb = (hex: string) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smooth = (from: number, to: number, x: number) => { const t = clamp01((x - from) / (to - from)); return t * t * (3 - 2 * t); };
const fract = (x: number) => x - Math.floor(x);

function partColour(part: Part, u: number, v: number): number[] {
  const [base, mid, tip] = part.colour.map(rgb);
  let colour = v < 0.5 ? mix(base, mid, v * 2) : mix(mid, tip, (v - 0.5) * 2);
  if (part.kind === PART_KIND.petal) colour = mix(colour, mix(base, mid, 0.62), part.depth * 0.66);
  const tone = 0.93 + 0.14 * fract(part.phase * 7.3);
  const rim = 1 + 0.14 * smooth(0.7, 1, Math.abs(u)) * smooth(0.1, 0.5, v);
  return colour.map((x) => x * tone * rim);
}

/** Both faces of a part, sharing their rim so it comes out rounded. */
function writePart(part: Part, blossom: Blossom, head: THREE.Matrix4, mesh: Built): void {
  const pose = poseOf(part, blossom, LIFE);
  const stamen = part.kind === PART_KIND.stamen;
  const cols = stamen ? 4 : COLS;
  const rows = stamen ? 28 : ROWS;
  const first = mesh.positions.length / 3;
  const point = new THREE.Vector3();
  const put = (i: number, j: number, face: number) => {
    const x = (i / cols) * 2 - 1;
    const u = Math.sign(x) * (1 - (1 - Math.abs(x)) ** 1.4);
    // The very last row lies along one line, and smooth shading can't cope with that.
    const v = (1 - (1 - j / rows) ** 1.5) * (stamen ? 1 : 0.992);
    const [px, py, pz] = pose({ x: u, y: v, z: face });
    point.set(px, py, pz).applyMatrix4(head);
    mesh.positions.push(point.x, point.y, point.z);
    (mesh.colours as number[]).push(...partColour(part, u, v));
    (mesh.grid as number[]).push(u, v);
  };
  const front: number[] = [];
  const back: number[] = [];
  let next = first;
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      put(i, j, stamen ? 0 : 1);
      front.push(next);
      next += 1;
    }
  }
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const shared = stamen || i === 0 || i === cols || j === 0 || j === rows;
      if (shared) back.push(front[j * (cols + 1) + i]);
      else { put(i, j, -1); back.push(next); next += 1; }
    }
  }
  const at = (table: number[], i: number, j: number) => table[j * (cols + 1) + i];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      mesh.indices.push(at(front, i, j), at(front, i + 1, j), at(front, i + 1, j + 1), at(front, i, j), at(front, i + 1, j + 1), at(front, i, j + 1));
      if (!stamen) mesh.indices.push(at(back, i, j), at(back, i + 1, j + 1), at(back, i + 1, j), at(back, i, j), at(back, i, j + 1), at(back, i + 1, j + 1));
    }
  }
}

/** leafPoint from leaf.ts, with the margin cut in the shape instead of by the pixel. */
function leafPoint(u0: number, vIn: number, size: number[], curve: number[], outline: number[], age: number) {
  const v = clamp01(vIn);
  const arc = (angle: number, c: number, s: number) => {
    const bend = Math.abs(c) < 0.001 ? 0.001 : c;
    return [(Math.sin(angle + bend * s) - Math.sin(angle)) / bend, (Math.cos(angle + bend * s) - Math.cos(angle)) / bend];
  };
  const grown = 0.18 + 0.82 * age;
  const stalk = size[0] * grown;
  const blade = size[1] * grown;
  const at = v * (stalk + blade);
  const arch = -0.4 + (curve[0] + 0.4) * age;
  const droop = -1.1 + (curve[1] + 1.1) * age;
  const stalkCurve = arch / Math.max(stalk, 0.001);
  const bladeCurve = droop / Math.max(blade, 0.001);
  let along: number[];
  let angle: number;
  if (at < stalk) { along = arc(0, stalkCurve, at); angle = stalkCurve * at; }
  else {
    const a = arc(0, stalkCurve, stalk);
    const b2 = arc(arch, bladeCurve, at - stalk);
    along = [a[0] + b2[0], a[1] + b2[1]];
    angle = arch + bladeCurve * (at - stalk);
  }
  const b = (at - stalk) / Math.max(blade, 0.001);
  const inBlade = smooth(0, 0.03, b);
  let limit = 1;
  if (b >= 0) {
    if (size[3] > 0) limit = Math.min(limit, 1 - size[3] * (1 - fract(b * 7)));
    if (curve[3] > 0) limit = Math.min(limit, 0.34 + 0.66 * Math.sqrt(Math.abs(Math.cos(b * Math.PI * curve[3] * 2))));
  }
  const u = u0 * limit;
  const shape = Math.max(Math.sin(Math.PI * clamp01(b) ** outline[0]), 0) ** outline[1];
  const stalkWidth = (0.014 + size[0] * 0.016) * (0.5 + 0.5 * age);
  const widthHere = stalkWidth + ((size[2] * (0.46 + 0.54 * age) * shape) - stalkWidth) * inBlade;
  const foldTarget = 1.42 + (curve[2] - 1.42) * smooth(0.3, 1, age);
  const fold = 1.1 + (foldTarget - 1.1) * inBlade;
  let lift = Math.abs(u) * widthHere * Math.sin(fold) * inBlade;
  const quilt = 0.01 * Math.sin((b - Math.abs(u) * 0.42) * 22) * Math.abs(u) * (1 - Math.abs(u)) * inBlade;
  const wave = 0.016 * Math.sin(b * 9 + u * 2) * u * u * inBlade;
  lift += (quilt + wave) * age;
  const up = [Math.sin(angle), Math.cos(angle)];
  return { point: [along[0] + up[0] * lift, along[1] + up[1] * lift, u * widthHere * Math.cos(fold)], side: Math.abs(u), b };
}

function fromGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, name: string, material: string): Built {
  const copy = geometry.clone().applyMatrix4(matrix);
  return { name, material, positions: Array.from(copy.attributes.position.array), indices: Array.from((copy.index as THREE.BufferAttribute).array) };
}

const write = (name: string) => {
  const seed = seedOf(name);
  const blossom = buildBlossom(seed);
  const plan = blossom.stem;
  const stemPath = emptyPath();
  traceStem(plan, LIFE, 0, stemPath);
  const tip = placeAt(stemPath, stemPath.length);
  const tangent = new THREE.Vector3(tip.tx, tip.ty, tip.tz);
  const position = new THREE.Vector3(tip.x, tip.y, tip.z);
  const head = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent), new THREE.Vector3(1, 1, 1));
  const heartAt = position.clone().addScaledVector(tangent, 0.28);
  const lampAt = new THREE.Vector3(0, 0.26, 0).applyMatrix4(head);

  const meshes: Built[] = [];
  const parts = (material: string, list: Part[]) => {
    if (!list.length) return;
    const mesh: Built = { name: material, material, positions: [], indices: [], colours: [], grid: [] };
    list.forEach((part) => writePart(part, blossom, head, mesh));
    meshes.push(mesh);
  };
  parts("petal", blossom.petals);
  parts("sepal", blossom.head.filter((p) => p.kind === PART_KIND.sepal));
  parts("stamen", blossom.head.filter((p) => p.kind === PART_KIND.stamen));

  const tube = emptyTube();
  writeTube(plan, stemPath, tube);
  meshes.push({ name: "stem", material: "stem", positions: Array.from(tube.positions), indices: tubeIndex(), colours: Array.from(tube.colours) });

  const RECEPTACLE = new THREE.LatheGeometry([[0.016, -0.24], [0.019, -0.17], [0.028, -0.12], [0.05, -0.07], [0.078, -0.03], [0.09, 0.005], [0.075, 0.035], [0.03, 0.05], [0, 0.052]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const hipScale = blossom.species.sepals > 0 ? 1 : 0.68;
  meshes.push(fromGeometry(RECEPTACLE, head.clone().multiply(new THREE.Matrix4().makeScale(hipScale, hipScale, hipScale)), "hip", "hip"));
  meshes.push(fromGeometry(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), head.clone().multiply(new THREE.Matrix4().makeScale(0.115, 0.062, 0.115)), "heart", "heart"));
  const pod = blossom.species.pod;
  if (pod) meshes.push(fromGeometry(new THREE.SphereGeometry(1, 48, 32), head.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, pod.height * 0.7, 0), new THREE.Quaternion(), new THREE.Vector3(pod.radius, pod.height, pod.radius))), "pod", "pod"));

  if (blossom.thorns.length) {
    const matrices = new Float32Array(blossom.thorns.length * 16);
    writeThorns(plan, stemPath, blossom.thorns, matrices);
    const mesh: Built = { name: "thorn", material: "thorn", positions: [], indices: [] };
    const cone = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);
    blossom.thorns.forEach((_, i) => {
      const one = fromGeometry(cone, new THREE.Matrix4().fromArray(matrices, i * 16), "t", "thorn");
      const offset = mesh.positions.length / 3;
      mesh.positions.push(...one.positions);
      mesh.indices.push(...one.indices.map((x) => x + offset));
    });
    meshes.push(mesh);
  }

  const { geometry, blades } = leafGeometry(blossom.leaves);
  const matrices = new Float32Array(blades.length * 16);
  const ages = new Float32Array(blades.length);
  writeLeaves(plan, stemPath, LIFE, blades, matrices, ages);
  const size = geometry.getAttribute("aSize");
  const curve = geometry.getAttribute("aCurve");
  const outline = geometry.getAttribute("aOutline");
  const [shade, green, bright] = blossom.species.green.map(rgb);
  const leafMesh: Built = { name: "leaf", material: "leaf", positions: [], indices: [], colours: [], grid: [] };
  const LC = 28;
  const LR = 200;
  const point = new THREE.Vector3();
  blades.forEach((_, n) => {
    const s = [size.getX(n), size.getY(n), size.getZ(n), size.getW(n)];
    const c = [curve.getX(n), curve.getY(n), curve.getZ(n), curve.getW(n)];
    const o = [outline.getX(n), outline.getY(n)];
    const matrix = new THREE.Matrix4().fromArray(matrices, n * 16);
    const first = leafMesh.positions.length / 3;
    for (let j = 0; j <= LR; j += 1) {
      for (let i = 0; i <= LC; i += 1) {
        const { point: p, side, b } = leafPoint((i / LC) * 2 - 1, j / LR, s, c, o, ages[n]);
        point.set(p[0], p[1], p[2]).applyMatrix4(matrix);
        leafMesh.positions.push(point.x, point.y, point.z);
        const rib = 1 - smooth(0, 0.05, side);
        const vein = smooth(0.88, 1, Math.abs(Math.sin((b - side * 0.42) * 22))) * (1 - side * 0.5);
        let leaf = mix(shade, green, smooth(0, 0.8, b * 0.5 + side * 0.6));
        leaf = mix(leaf, bright, rib * 0.62 + vein * 0.2);
        leaf = mix(leaf, bright, (1 - ages[n]) * 0.5);
        if (b < 0) leaf = green;
        (leafMesh.colours as number[]).push(...leaf);
        (leafMesh.grid as number[]).push(side, b);
      }
    }
    for (let j = 0; j < LR; j += 1) {
      for (let i = 0; i < LC; i += 1) {
        const a = first + j * (LC + 1) + i;
        leafMesh.indices.push(a, a + 1, a + LC + 2, a, a + LC + 2, a + LC + 1);
      }
    }
  });
  meshes.push(leafMesh);

  const chunks: Buffer[] = [];
  let offset = 0;
  const add = (array: Float32Array | Uint32Array) => {
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    chunks.push(buffer);
    offset += buffer.length;
    return offset - buffer.length;
  };
  const manifest = {
    name,
    species: blossom.species.id,
    heart: heartAt.toArray(),
    lamp: lampAt.toArray(),
    colours: {
      hip: rgb(blossom.species.stem.top),
      heart: heartColour(blossom.colour).toArray(),
      pod: rgb(blossom.species.pod?.colour ?? blossom.species.green[1]),
      thorn: rgb("#7c4a34"),
      bright,
      air: mix(rgb(blossom.colour[1]), rgb("#ffcf9e"), 0.45),
    },
    meshes: meshes.map((m) => ({
      name: m.name,
      material: m.material,
      vertices: m.positions.length / 3,
      triangles: m.indices.length / 3,
      positions: add(Float32Array.from(m.positions)),
      indices: add(Uint32Array.from(m.indices)),
      colours: m.colours ? add(Float32Array.from(m.colours)) : null,
      grid: m.grid ? add(Float32Array.from(m.grid)) : null,
    })),
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${name.toLowerCase()}.bin`), Buffer.concat(chunks));
  fs.writeFileSync(path.join(out, `${name.toLowerCase()}.json`), JSON.stringify(manifest));
  console.log(name, blossom.species.id, meshes.map((m) => `${m.name}:${m.positions.length / 3}`).join(" "));
};

names.forEach(write);
