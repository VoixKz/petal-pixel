// The plant's skeleton. A stem is drawn the way it grows: from the soil to a tip that
// keeps moving upward, not stretched into place. A shoot comes out of the ground bent
// over like a hook, straightens, circles slowly while it climbs and finally bends its
// neck to carry the flower. Everything that sits on the stem is placed from this path.
import { LIFE, settle, smooth, stemGrowth } from "./life";

export const STEM_SEGMENTS = 44;
export const STEM_SIDES = 10;
export const LEAF_SPAN = 0.17;

const HOOK = 2.5;
const HOOK_LENGTH = 0.13;
const NECK_LENGTH = 0.62;
const CIRCLING = 0.16;
const SWAY = 0.012;

export interface StemPlan {
  height: number;
  radius: number;
  sideBend: number;
  frontBend: number;
  phase: number;
  /** Which way the shoot's hook points as it comes out of the ground. */
  hookTurn: number;
  /** How far the neck bends toward the viewer once the flower opens. */
  nod: number;
  /** Heights of the leaf joints, as shares of the stem. */
  nodes: readonly number[];
  colour: { base: readonly number[]; top: readonly number[] };
}

/** The centre line of the stem at one moment, with a frame that does not twist. */
export interface StemPath {
  length: number;
  growth: number;
  points: Float32Array;
  tangents: Float32Array;
  normals: Float32Array;
  sides: Float32Array;
}

export function emptyPath(): StemPath {
  const size = (STEM_SEGMENTS + 1) * 3;
  return {
    length: 0,
    growth: 0,
    points: new Float32Array(size),
    tangents: new Float32Array(size),
    normals: new Float32Array(size),
    sides: new Float32Array(size),
  };
}

/** Walks the stem from the soil to its tip. `time` only moves it in the wind. */
export function traceStem(plan: StemPlan, life: number, time: number, path: StemPath): void {
  const growth = stemGrowth(life);
  const open = smooth(life, LIFE.petals[0], LIFE.petals[1]);
  const length = Math.max(plan.height * growth, 0.002);
  const step = length / STEM_SEGMENTS;
  const hook = HOOK * (1 - smooth(growth, 0.05, 0.3));
  const neck = (plan.nod * 0.22 + plan.nod * 0.78 * open) * smooth(growth, 0.55, 1);
  const circleAt = growth * 9 + plan.phase;
  const circling = CIRCLING * Math.sin(growth * Math.PI);
  const swayX = SWAY * Math.sin(time * 0.7 + plan.phase);
  const swayZ = SWAY * Math.sin(time * 0.53 + plan.phase * 2);
  const { points, tangents, normals, sides } = path;

  let x = 0;
  let y = -0.03;
  let z = 0;
  let px = 0;
  let py = 1;
  let pz = 0;
  let nx = 1;
  let ny = 0;
  let nz = 0;
  for (let k = 0; k <= STEM_SEGMENTS; k += 1) {
    const reach = k * step;
    const share = reach / plan.height;
    const toTip = length - reach;
    const settled = smooth(share, 0, 0.3);
    const crook = hook * Math.exp(-toTip / HOOK_LENGTH);
    const tipOnly = Math.exp(-toTip / 0.5);
    const across =
      plan.sideBend * Math.sin(share * 5.2 + plan.phase) * settled +
      crook * Math.cos(plan.hookTurn) +
      circling * tipOnly * Math.cos(circleAt) +
      swayX * share;
    const along =
      plan.frontBend * Math.sin(share * 3.7 + plan.phase * 1.7) * settled +
      crook * Math.sin(plan.hookTurn) +
      neck * (1 - smooth(toTip, 0, NECK_LENGTH)) +
      circling * tipOnly * Math.sin(circleAt) +
      swayZ * share;
    let tx = Math.sin(across);
    let ty = Math.cos(across) * Math.cos(along);
    let tz = Math.sin(along);
    const size = Math.hypot(tx, ty, tz);
    tx /= size;
    ty /= size;
    tz /= size;

    // Carries the frame from the last point along the smallest turn, so nothing twists.
    const dot = nx * tx + ny * ty + nz * tz;
    nx -= dot * tx;
    ny -= dot * ty;
    nz -= dot * tz;
    const nSize = Math.hypot(nx, ny, nz);
    nx /= nSize;
    ny /= nSize;
    nz /= nSize;

    if (k > 0) {
      x += ((px + tx) / 2) * step;
      y += ((py + ty) / 2) * step;
      z += ((pz + tz) / 2) * step;
    }
    px = tx;
    py = ty;
    pz = tz;
    const at = k * 3;
    points[at] = x;
    points[at + 1] = y;
    points[at + 2] = z;
    tangents[at] = tx;
    tangents[at + 1] = ty;
    tangents[at + 2] = tz;
    normals[at] = nx;
    normals[at + 1] = ny;
    normals[at + 2] = nz;
    sides[at] = ty * nz - tz * ny;
    sides[at + 1] = tz * nx - tx * nz;
    sides[at + 2] = tx * ny - ty * nx;
  }
  path.length = length;
  path.growth = growth;
}

/** The stem's thickness: thin at a young tip, thickening at the leaf joints. */
export function radiusAt(plan: StemPlan, path: StemPath, reach: number): number {
  const share = reach / plan.height;
  const toTip = path.length - reach;
  const swell = plan.nodes.reduce((sum, node) => sum + Math.exp(-(((share - node) / 0.014) ** 2)), 0);
  return plan.radius * (0.45 + 0.55 * path.growth) * (1 - 0.42 * share) * Math.min(0.55 + toTip / 0.16, 1) * (1 + 0.2 * swell);
}

export interface TubeBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  /** Closeness to the flower, for the light that reaches down the stem at night. */
  nearness: Float32Array;
}

const TUBE_VERTICES = (STEM_SEGMENTS + 1) * (STEM_SIDES + 1);

export const emptyTube = (): TubeBuffers => ({
  positions: new Float32Array(TUBE_VERTICES * 3),
  normals: new Float32Array(TUBE_VERTICES * 3),
  colours: new Float32Array(TUBE_VERTICES * 3),
  nearness: new Float32Array(TUBE_VERTICES),
});

/** Writes the stem's skin around its centre line. */
export function writeTube(plan: StemPlan, path: StemPath, tube: TubeBuffers): void {
  const { points, normals, sides } = path;
  const { base, top } = plan.colour;
  let v = 0;
  for (let k = 0; k <= STEM_SEGMENTS; k += 1) {
    const at = k * 3;
    const reach = (k / STEM_SEGMENTS) * path.length;
    const radius = radiusAt(plan, path, reach);
    const share = reach / plan.height;
    const toTip = path.length - reach;
    // Fresh growth at the tip is paler than the stem below it.
    const fresh = Math.exp(-toTip / 0.3) * (1 - path.growth * 0.7);
    const shade = 1 + fresh * 0.5;
    for (let j = 0; j <= STEM_SIDES; j += 1) {
      const angle = (j / STEM_SIDES) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const ridged = radius * (1 + 0.045 * Math.cos(angle * 3));
      const dx = normals[at] * cos + sides[at] * sin;
      const dy = normals[at + 1] * cos + sides[at + 1] * sin;
      const dz = normals[at + 2] * cos + sides[at + 2] * sin;
      tube.positions[v * 3] = points[at] + dx * ridged;
      tube.positions[v * 3 + 1] = points[at + 1] + dy * ridged;
      tube.positions[v * 3 + 2] = points[at + 2] + dz * ridged;
      tube.normals[v * 3] = dx;
      tube.normals[v * 3 + 1] = dy;
      tube.normals[v * 3 + 2] = dz;
      for (let c = 0; c < 3; c += 1) tube.colours[v * 3 + c] = (base[c] + (top[c] - base[c]) * share) * shade;
      tube.nearness[v] = Math.exp(-toTip * 1.7);
      v += 1;
    }
  }
}

/** The index of a closed tube's triangles. */
export function tubeIndex(): number[] {
  const index: number[] = [];
  const row = STEM_SIDES + 1;
  for (let k = 0; k < STEM_SEGMENTS; k += 1) {
    for (let j = 0; j < STEM_SIDES; j += 1) {
      const a = k * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return index;
}

export interface Place {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  nx: number;
  ny: number;
  nz: number;
  sx: number;
  sy: number;
  sz: number;
}

/** A point of the stem and its frame, at a distance from the soil. */
export function placeAt(path: StemPath, reach: number): Place {
  const f = Math.min(Math.max((reach / path.length) * STEM_SEGMENTS, 0), STEM_SEGMENTS);
  const k = Math.min(Math.floor(f), STEM_SEGMENTS - 1);
  const t = f - k;
  const read = (list: Float32Array, c: number) => list[k * 3 + c] + (list[(k + 1) * 3 + c] - list[k * 3 + c]) * t;
  return {
    x: read(path.points, 0),
    y: read(path.points, 1),
    z: read(path.points, 2),
    tx: read(path.tangents, 0),
    ty: read(path.tangents, 1),
    tz: read(path.tangents, 2),
    nx: read(path.normals, 0),
    ny: read(path.normals, 1),
    nz: read(path.normals, 2),
    sx: read(path.sides, 0),
    sy: read(path.sides, 1),
    sz: read(path.sides, 2),
  };
}

export interface Leaflet {
  /** Where on the leaf stalk it joins, as a share of the stalk. */
  along: number;
  side: -1 | 1;
  splay: number;
  scale: number;
}

export interface Leaf {
  node: number;
  azimuth: number;
  birth: number;
  /** The angle it finally stands away from the stem. */
  axil: number;
  stalk: number;
  blade: number;
  width: number;
  /** How far the stalk bends along its length, and the blade along its own. */
  arch: number;
  droop: number;
  /** How far the two halves stay folded along the midrib. */
  fold: number;
  waist: number;
  blunt: number;
  teeth: number;
  lobes: number;
  leaflets: readonly Leaflet[];
}

/** One drawn blade: a leaf's end leaflet, or one of the pairs along its stalk. */
export interface Blade {
  leaf: Leaf;
  leaflet: Leaflet | null;
}

export const bladesOf = (leaves: readonly Leaf[]): Blade[] =>
  leaves.flatMap((leaf) => [{ leaf, leaflet: null }, ...leaf.leaflets.map((leaflet) => ({ leaf, leaflet }))]);

export const leafAge = (leaf: Leaf, life: number) => settle((life - leaf.birth) / LEAF_SPAN);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The part of a leaf's growth the shader and the placing here must agree on. */
export const leafReachAt = (age: number) => lerp(0.18, 1, age);
export const stalkBendAt = (arch: number, age: number) => lerp(-0.4, arch, age);

/** Writes a column-major matrix for every blade, and how far each has unfolded. */
export function writeLeaves(plan: StemPlan, path: StemPath, life: number, blades: readonly Blade[], matrices: Float32Array, ages: Float32Array): void {
  blades.forEach(({ leaf, leaflet }, index) => {
    const reach = leaf.node * plan.height;
    const age = leafAge(leaf, life);
    ages[index] = age;
    const m = index * 16;
    if (age <= 0 || reach > path.length) {
      matrices.fill(0, m, m + 16);
      return;
    }
    const p = placeAt(path, reach);
    const cos = Math.cos(leaf.azimuth);
    const sin = Math.sin(leaf.azimuth);
    const rx = p.nx * cos + p.sx * sin;
    const ry = p.ny * cos + p.sy * sin;
    const rz = p.nz * cos + p.sz * sin;
    const lean = lerp(0.1, leaf.axil, settle(age * 1.2));
    const leanCos = Math.cos(lean);
    const leanSin = Math.sin(lean);
    // X runs along the leaf, Y comes out of its upper face, Z runs across it.
    let xx = p.tx * leanCos + rx * leanSin;
    let xy = p.ty * leanCos + ry * leanSin;
    let xz = p.tz * leanCos + rz * leanSin;
    let yx = p.tx * leanSin - rx * leanCos;
    let yy = p.ty * leanSin - ry * leanCos;
    let yz = p.tz * leanSin - rz * leanCos;
    let zx = xy * yz - xz * yy;
    let zy = xz * yx - xx * yz;
    let zz = xx * yy - xy * yx;
    const radius = radiusAt(plan, path, reach) * 0.8;
    let ox = p.x + rx * radius;
    let oy = p.y + ry * radius;
    let oz = p.z + rz * radius;

    if (leaflet) {
      // Follows the bend of the leaf's stalk to the joint, then swings out to its side.
      const stalk = leaf.stalk * leafReachAt(age) * leaflet.along;
      const bend = stalkBendAt(leaf.arch, age) / Math.max(leaf.stalk * leafReachAt(age), 0.001);
      const angle = bend * stalk;
      const curve = Math.abs(bend) < 0.001 ? 0.001 : bend;
      const ax = Math.sin(angle) / curve;
      const ay = (Math.cos(angle) - 1) / curve;
      ox += xx * ax + yx * ay;
      oy += xy * ax + yy * ay;
      oz += xz * ax + yz * ay;
      const along = Math.cos(angle);
      const off = Math.sin(angle);
      const bentX = [xx * along - yx * off, xy * along - yy * off, xz * along - yz * off];
      const bentY = [xx * off + yx * along, xy * off + yy * along, xz * off + yz * along];
      const splay = leaflet.splay * lerp(0.2, 1, age) * leaflet.side;
      const c = Math.cos(splay);
      const s = Math.sin(splay);
      const sideX = [bentX[0] * c + zx * s, bentX[1] * c + zy * s, bentX[2] * c + zz * s];
      const sideZ = [zx * c - bentX[0] * s, zy * c - bentX[1] * s, zz * c - bentX[2] * s];
      [xx, xy, xz] = sideX;
      [yx, yy, yz] = bentY;
      [zx, zy, zz] = sideZ;
    }
    matrices.set([xx, xy, xz, 0, yx, yy, yz, 0, zx, zy, zz, 0, ox, oy, oz, 1], m);
  });
}

export interface Thorn {
  node: number;
  azimuth: number;
  size: number;
}

/** Writes a matrix for every thorn: a cone standing on the stem, hooked slightly downward. */
export function writeThorns(plan: StemPlan, path: StemPath, thorns: readonly Thorn[], matrices: Float32Array): void {
  thorns.forEach((thorn, index) => {
    const reach = thorn.node * plan.height;
    const m = index * 16;
    const size = thorn.size * smooth(path.length - reach, 0, 0.5);
    if (reach > path.length || size <= 0) {
      matrices.fill(0, m, m + 16);
      return;
    }
    const p = placeAt(path, reach);
    const cos = Math.cos(thorn.azimuth);
    const sin = Math.sin(thorn.azimuth);
    const rx = p.nx * cos + p.sx * sin;
    const ry = p.ny * cos + p.sy * sin;
    const rz = p.nz * cos + p.sz * sin;
    // The cone points along Y: mostly outward, tipped down the stem.
    const ux = rx - p.tx * 0.5;
    const uy = ry - p.ty * 0.5;
    const uz = rz - p.tz * 0.5;
    const radius = radiusAt(plan, path, reach);
    const wide = size * 0.42;
    const long = size * 0.9;
    const zx = p.ny * rz - p.nz * ry;
    const zy = p.nz * rx - p.nx * rz;
    const zz = p.nx * ry - p.ny * rx;
    matrices.set(
      [p.tx * wide, p.ty * wide, p.tz * wide, 0, ux * long, uy * long, uz * long, 0, zx * wide, zy * wide, zz * wide, 0, p.x + rx * radius, p.y + ry * radius, p.z + rz * radius, 1],
      m,
    );
  });
}
