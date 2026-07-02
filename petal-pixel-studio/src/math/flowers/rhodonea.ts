import * as THREE from "three";
import type { RhodoneaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { stitchQuads, filterZeroAreaTriangles } from "@/math/flowers/stitch";
import { hsbToThreeColor } from "@/math/supplement";

export const RHODONEA_VERTEX_CAP = 130000;

/**
 * Rhodonea (rose-curve) 3D family. r = radius * cos(k*theta) turned into P
 * per-petal lofted surface patches. Odd k -> k petals, even k -> 2k petals.
 * Color comes from the palette (sampled at length param u); if the palette has
 * no stops we fall back to the canonical HSB ramp.
 *
 * Formulas match docs/superpowers/plans/2026-07-02-phase2-richer-generation.md
 * Appendix "rhodonea (NEW)".
 */
export function createRhodoneaGeometry(
  rp: RhodoneaParams,
  palette: Palette,
): THREE.BufferGeometry {
  // --- Guards: k coerced to an integer in [2,9] so pi/(2k) is finite/nonzero.
  const k = THREE.MathUtils.clamp(Math.round(rp.k), 2, 9);
  const P = k % 2 === 1 ? k : 2 * k;

  // --- Vertex-cap-aware segment resolution.
  let lengthSeg = Math.max(12, Math.round(rp.lengthSeg));
  let widthSeg = Math.max(8, Math.round(rp.widthSeg));
  const estimate = P * (lengthSeg + 1) * (widthSeg + 1);
  if (estimate > RHODONEA_VERTEX_CAP) {
    const shrink = Math.sqrt(RHODONEA_VERTEX_CAP / estimate);
    lengthSeg = Math.max(12, Math.round(lengthSeg * shrink));
    widthSeg = Math.max(8, Math.round(widthSeg * shrink));
  }

  const radius = rp.radius;
  const petalSpan = rp.petalSpan;
  const widthProfile = rp.widthProfile;
  const heightProfile = rp.heightProfile;
  const thickness = rp.thickness;
  const curl = rp.curl;
  // Reconciliation #7: new-family sat_shift/bri_shift are FRACTIONS; multiply
  // by 100 before passing to hsbToThreeColor's 0-100 HSB scale.
  const satShiftHsb = rp.satShift * 100;
  const briShiftHsb = rp.briShift * 100;

  const hasPalette = palette.stops.length > 0;
  const scratch = new THREE.Color();

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < P; p += 1) {
    const betaP = (2 * Math.PI * p) / P;

    // Per-petal grid of vertex indices: (lengthSeg+1) rows x (widthSeg+1) cols.
    const grid: number[][] = Array.from({ length: lengthSeg + 1 }, () =>
      Array(widthSeg + 1).fill(-1),
    );

    for (let iu = 0; iu <= lengthSeg; iu += 1) {
      const u = iu / lengthSeg; // 0 base -> 1 tip
      const phiMax = (Math.PI / (2 * k)) * petalSpan;
      const rC = radius * u;
      // sin(pi*u)^0.5: base row (u=0) collapses to zero -> zero-area quads
      // at the base are caught by stitchQuads' index-equality guard (all iv
      // share x=z=0) and then by filterZeroAreaTriangles for any stragglers.
      const angHalf = phiMax * Math.pow(Math.sin(Math.PI * u), 0.5);

      // Palette / HSB color for this length row.
      if (hasPalette) {
        // Reconciliation #8: sample palette without re-applying per-shape shifts.
        samplePaletteInto(palette.stops, u, scratch);
      } else {
        // HSB fallback: hue rotates per petal, sat/bri ramp along u.
        const hue = 340 - 6 * p;
        const sat = 85 - 15 * u + satShiftHsb;
        const bri = 30 + 55 * u + briShiftHsb;
        scratch.copy(hsbToThreeColor(hue, sat, bri));
      }

      for (let iv = 0; iv <= widthSeg; iv += 1) {
        const v = (iv / widthSeg) * 2 - 1; // -1 .. 1 cross
        const localAng = (angHalf * v * widthProfile) / 0.42;
        const phi = betaP + localAng;
        const rEdge = rC;
        const x0 = rEdge * Math.cos(phi);
        const z0 = rEdge * Math.sin(phi);
        const arch = heightProfile * Math.sin(Math.PI * u);
        const curlDown = curl * heightProfile * Math.pow(u, 3);
        const y0 = -(arch - curlDown);
        const yShell = thickness * (1 - v * v) * (1 - u);
        const x = x0;
        const z = z0;
        const y = y0 - yShell;

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          // Leave grid cell as -1 -> quad will be skipped by stitchQuads.
          continue;
        }

        const idx = positions.length / 3;
        grid[iu][iv] = idx;
        positions.push(x, y, z);
        colors.push(scratch.r, scratch.g, scratch.b);
      }
    }

    stitchQuads(grid, indices);
  }

  // World-space degenerate filter: catches pinched base/tip quads whose corners
  // have distinct indices but (near-)coincident positions (petal base collapse).
  const filteredIndices = filterZeroAreaTriangles(positions, indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(filteredIndices);
  geometry.computeVertexNormals();
  return geometry;
}
