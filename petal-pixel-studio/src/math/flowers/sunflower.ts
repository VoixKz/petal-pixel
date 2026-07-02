import * as THREE from "three";
import type { SunflowerParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { stitchQuads, filterZeroAreaTriangles } from "@/math/flowers/stitch";
import { degToRad } from "@/math/supplement";

// Fixed math constant (NOT a param): 180 * (3 - sqrt(5)).
const GOLDEN_ANGLE_DEG = 137.50776405003785;
const MAX_VERTICES = 130000;
const RAY_RADIAL_SEG = 10; // petalRadialSeg
const RAY_CROSS_SEG = 6; // petalCrossSeg

/**
 * Phyllotaxis sunflower: domed seed-head disc (polar surface grid) plus a rim of
 * ray-petal patches, built as one indexed BufferGeometry with per-vertex colors.
 */
export function createSunflowerGeometry(
  params: SunflowerParams,
  palette: Palette,
): THREE.BufferGeometry {
  const scale = params.scale;
  const domeHeight = params.domeHeight;
  const discRatio = params.discRatio;
  const rayLength = params.rayLength;
  const rayWidth = params.rayWidth;
  const seedPacking = params.seedPacking;
  const satShift = params.satShift;
  const briShift = params.briShift;

  // --- Vertex-cap guard: shrink grid resolution to fit MAX_VERTICES. ---
  let rings = Math.max(40, Math.round(params.floretRings));
  let spokes = Math.max(120, Math.round(params.floretSpokes));
  const rayPetals = Math.max(3, Math.round(params.rayPetals));

  // Estimate vertex count: disc rings (skip center, +1 for center vertex) + ray petals
  const est =
    rings * (spokes + 1) +
    1 +
    rayPetals * (RAY_RADIAL_SEG + 1) * (RAY_CROSS_SEG + 1);
  if (est > MAX_VERTICES) {
    const shrink = Math.sqrt(MAX_VERTICES / est);
    rings = Math.max(40, Math.round(rings * shrink));
    spokes = Math.max(120, Math.round(spokes * shrink));
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const scratch = new THREE.Color();

  const pushVertex = (x: number, y: number, z: number, t: number): number => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return -1;
    }
    const vi = positions.length / 3;
    positions.push(x, y, z);
    samplePaletteInto(palette.stops, THREE.MathUtils.clamp(t, 0, 1), scratch);
    const hsl = scratch.getHSL({ h: 0, s: 0, l: 0 });
    scratch.setHSL(
      hsl.h,
      THREE.MathUtils.clamp(hsl.s + satShift, 0, 1),
      THREE.MathUtils.clamp(hsl.l + briShift, 0, 1),
    );
    colors.push(scratch.r, scratch.g, scratch.b);
    return vi;
  };

  // ---------- Seed head: domed polar surface grid ----------
  // We skip ring i=0 (all verts share position (0, -domeHeight, 0)) and instead
  // push a single center vertex, then fan it to ring i=1.
  const discR = discRatio * scale;
  const Nf = Math.max(1, rings * spokes);
  const phGA = degToRad(GOLDEN_ANGLE_DEG);
  // seedPacking sets how many phyllotaxis spirals are visible (spiral frequency),
  // scaling the base sqrt(Nf) count. This is its canonical role — NOT the bump
  // amplitude (that stays fixed relative to discR so the seed texture survives
  // at high resolution).
  const k1 = Math.max(1, Math.round(Math.sqrt(Nf) * seedPacking));

  // Center vertex (t=0, palette color for center)
  const centerIdx = pushVertex(0, -(domeHeight), 0, 0);

  // Grid of disc rings 1..rings (ring 0 = center, handled separately)
  // grid[ri][ti] where ri=0 corresponds to disc ring index 1.
  const discGrid: number[][] = Array.from({ length: rings }, () =>
    new Array<number>(spokes + 1).fill(-1),
  );

  for (let i = 1; i <= rings; i += 1) {
    const t = i / rings; // 0..1 radial (never 0 since i >= 1)
    for (let j = 0; j <= spokes; j += 1) {
      // Seam closure: last column reuses column 0.
      if (j === spokes) {
        discGrid[i - 1][j] = discGrid[i - 1][0];
        continue;
      }
      const alpha = (2 * Math.PI * j) / spokes;
      let radius = discR * Math.sqrt(t);
      // Phyllotaxis seed-bump surface texture (plan Appendix)
      const bumpA = 0.5 * (1 + Math.cos(k1 * (alpha - t / phGA)));
      const bumpB = 0.5 * (1 + Math.cos((k1 + 1) * (alpha + t / phGA)));
      const seedBump = 0.04 * discR * bumpA * bumpB;
      radius += 0.5 * seedBump;
      const zDome = domeHeight * (1 - t * t);
      const x = radius * Math.cos(alpha);
      const z = radius * Math.sin(alpha);
      const y = -(zDome + seedBump);
      discGrid[i - 1][j] = pushVertex(x, y, z, t);
    }
  }

  // Stitch rings 1..rings using stitchQuads (rows 1..rings-1 in discGrid)
  if (rings > 1) {
    stitchQuads(discGrid, indices);
  }

  // Fan: center vertex to innermost disc ring (discGrid[0])
  // Each spoke sector is a triangle: center → j → j+1
  for (let j = 0; j < spokes; j += 1) {
    const a = centerIdx;
    const b = discGrid[0][j];
    const c2 = discGrid[0][j + 1]; // j+spokes wraps to j via seam
    if (a >= 0 && b >= 0 && c2 >= 0 && b !== c2) {
      indices.push(a, b, c2);
    }
  }

  // ---------- Ray petals: rayPetals lofted patches around the rim ----------
  const rBase = discRatio * scale;
  const rTip = rBase + rayLength * scale;
  for (let p = 0; p < rayPetals; p += 1) {
    const alphaC = (2 * Math.PI * p) / rayPetals;
    const half = Math.min(
      (Math.PI / rayPetals) * rayWidth,
      0.9 * (Math.PI / rayPetals),
    );
    const petalGrid: number[][] = Array.from({ length: RAY_RADIAL_SEG + 1 }, () =>
      new Array<number>(RAY_CROSS_SEG + 1).fill(-1),
    );
    for (let si = 0; si <= RAY_RADIAL_SEG; si += 1) {
      const s = si / RAY_RADIAL_SEG; // 0..1 along petal length
      const taper = Math.pow(Math.sin(Math.PI * s), 0.6);
      const rad = rBase + (rTip - rBase) * s;
      const lift = 0.18 * rayLength * scale * Math.sin(Math.PI * s);
      for (let wi = 0; wi <= RAY_CROSS_SEG; wi += 1) {
        const w = (wi / RAY_CROSS_SEG) * 2 - 1; // -1..1 cross
        const widthAng = half * taper * w;
        const alpha = alphaC + widthAng;
        const x = rad * Math.cos(alpha);
        const z = rad * Math.sin(alpha);
        const y = -(domeHeight * 0.15 + lift);
        petalGrid[si][wi] = pushVertex(x, y, z, s);
      }
    }
    // At s=0 (base), taper = sin(0)^0.6 = 0 → all cross-section verts same position.
    // At s=1 (tip), taper = sin(PI)^0.6 = 0 → same problem.
    // We avoid zero-area by post-filtering: strip degenerate triangles from petalGrid.
    // stitchQuads uses index equality for zero-area detection — since base/tip rows
    // all have distinct vertex indices (but same world pos), we need to collapse them.
    // Collapse base row (si=0) to a single vertex (center of base edge).
    // Collapse tip row (si=RAY_RADIAL_SEG) to a single vertex.
    collapseRow(petalGrid, 0, positions, colors);
    collapseRow(petalGrid, RAY_RADIAL_SEG, positions, colors);
    stitchQuads(petalGrid, indices);
  }

  // Post-filter: remove any zero-area triangles (world-space check).
  // These arise when two corners of a quad share the same 3D position
  // (e.g. petal base/tip rows after row collapse, or seam verts coinciding).
  const filteredIndices = filterZeroAreaTriangles(positions, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(filteredIndices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Collapse all vertices in a petal grid row to a single representative vertex index.
 * Picks the middle-column vertex and reassigns all others in the row to that index,
 * so that stitchQuads' index-equality guard skips degenerate triangles.
 *
 * This is needed at the petal base (si=0, taper=0) and tip (si=last, taper=0)
 * where all cross-section vertices are coincident.
 */
function collapseRow(
  grid: number[][],
  ri: number,
  _positions: number[],
  _colors: number[],
): void {
  const row = grid[ri];
  // Find the middle vertex as the canonical index.
  const mid = Math.floor(row.length / 2);
  const canonical = row[mid];
  if (canonical < 0) return;
  for (let ci = 0; ci < row.length; ci += 1) {
    if (ci === mid) continue;
    const old = row[ci];
    if (old < 0) continue;
    // Simply reassign the grid cell to the canonical index.
    row[ci] = canonical;
    // The old vertex data stays in the array but will be unreferenced.
    void old;
  }
}

