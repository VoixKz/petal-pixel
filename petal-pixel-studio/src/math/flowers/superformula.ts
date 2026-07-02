import * as THREE from "three";
import type { SuperformulaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { superShape, hsbToThreeColor } from "@/math/supplement";
import { stitchQuads, filterZeroAreaTriangles } from "@/math/flowers/stitch";

const MAX_VERTICES = 130_000;

/**
 * Build a THREE.BufferGeometry from a dual-superformula spherical product.
 *
 * Canonical construction (Gielis 3D):
 *   For each grid point (i, j):
 *     theta = -π + 2π·i/uSeg          (longitude, formula-1)
 *     phi   = -π/2 + π·j/vSeg         (latitude,  formula-2)
 *     r1    = superShape(theta, m1, n1a, n2a, n3a, a1, b1)
 *     r2    = superShape(phi,   m2, n1b, n2b, n3b, a2, b2)
 *     X = r1·cosθ · r2·cosφ
 *     Y = r1·sinθ · r2·cosφ
 *     Z = r2·sinφ
 *   Scene remap: x=scale·X, z=scale·Y, y=-scale·Z
 *
 * Grid is (uSeg+1)×(vSeg+1) with longitude seam weld:
 *   grid[uSeg][j] = grid[0][j]  (share column-0 vertices)
 *
 * Colors: samplePaletteInto at tLat=(phi+π/2)/π, with optional HSL shifts.
 * Indices: stitchQuads → filterZeroAreaTriangles → computeVertexNormals.
 */
export function createSuperformulaGeometry(
  params: SuperformulaParams,
  palette: Palette,
): THREE.BufferGeometry {
  const {
    scale,
    m1, n1a, n2a, n3a, a1, b1,
    m2, n1b, n2b, n3b, a2, b2,
    satShift, briShift,
  } = params;

  // --- Vertex cap: shrink uSeg/vSeg if grid would exceed MAX_VERTICES ---
  let uSeg = Math.max(1, Math.round(params.uSeg));
  let vSeg = Math.max(1, Math.round(params.vSeg));
  const est = (uSeg + 1) * (vSeg + 1);
  if (est > MAX_VERTICES) {
    const shrink = Math.sqrt(MAX_VERTICES / est);
    uSeg = Math.max(120, Math.round(uSeg * shrink));
    vSeg = Math.max(80, Math.round(vSeg * shrink));
  }

  const positions: number[] = [];
  const colors: number[] = [];

  const hasPalette =
    palette != null &&
    palette.stops != null &&
    palette.stops.length >= 2;
  const scratch = new THREE.Color();

  // grid[i][j] holds the flat vertex index, or -1 if the vertex was skipped.
  const grid: number[][] = Array.from({ length: uSeg + 1 }, () =>
    new Array<number>(vSeg + 1).fill(-1),
  );

  for (let i = 0; i <= uSeg; i += 1) {
    const theta = -Math.PI + (2 * Math.PI * i) / uSeg;

    for (let j = 0; j <= vSeg; j += 1) {
      // Longitude seam weld: the last column reuses column-0 vertex indices.
      if (i === uSeg) {
        grid[i][j] = grid[0][j];
        continue;
      }

      const phi = -Math.PI / 2 + (Math.PI * j) / vSeg;

      const r1 = superShape(theta, m1, n1a, n2a, n3a, a1, b1);
      const r2 = superShape(phi, m2, n1b, n2b, n3b, a2, b2);

      const X = r1 * Math.cos(theta) * r2 * Math.cos(phi);
      const Y = r1 * Math.sin(theta) * r2 * Math.cos(phi);
      const Z = r2 * Math.sin(phi);

      // Scene remap: Three.js Y-up, flip Z→Y
      const x = scale * X;
      const z = scale * Y;
      const y = -scale * Z;

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        // grid[i][j] stays -1 → quads touching this vertex are skipped
        continue;
      }

      // Color: tLat = (phi + π/2) / π  ∈ [0, 1] (south→north)
      const tLat = (phi + Math.PI / 2) / Math.PI;
      if (hasPalette) {
        samplePaletteInto(palette.stops, tLat, scratch);
        if (satShift !== 0 || briShift !== 0) {
          const hsl = { h: 0, s: 0, l: 0 };
          scratch.getHSL(hsl);
          scratch.setHSL(
            hsl.h,
            THREE.MathUtils.clamp(hsl.s + satShift, 0, 1),
            THREE.MathUtils.clamp(hsl.l + briShift, 0, 1),
          );
        }
      } else {
        // Fallback ramp (only used when no palette is provided)
        const lobe = 0.5 * (1 + Math.cos(m1 * theta));
        const hue = 300 + 40 * tLat;
        const sat = 70 + 25 * lobe + satShift * 100;
        const bri = 35 + 50 * tLat + briShift * 100;
        scratch.copy(hsbToThreeColor(hue, sat, bri));
      }

      const index = positions.length / 3;
      grid[i][j] = index;
      positions.push(x, y, z);
      colors.push(scratch.r, scratch.g, scratch.b);
    }
  }

  // Build index buffer: stitch quads (index-equality degenerate skip),
  // then filter any remaining zero-area triangles (world-space pinches).
  const rawIndices: number[] = [];
  stitchQuads(grid, rawIndices);
  const indices = filterZeroAreaTriangles(positions, rawIndices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
