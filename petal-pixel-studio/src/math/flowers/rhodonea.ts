import * as THREE from "three";
import type { RhodoneaParams } from "@/math/flowerTypes";
import type { Palette, RgbStop } from "@/math/palette";
import {
  prepareStops,
  sampleStopsInto,
  liftValueFloor,
  EDGE_VALUE_FLOOR,
} from "@/math/palette";
import { stitchQuads, filterZeroAreaTriangles } from "@/math/flowers/stitch";
import { solidify, SHELL_THICKNESS } from "@/math/flowers/shell";
import { addCenterDome } from "@/math/flowers/center";
import { hsbToThreeColor } from "@/math/supplement";

/** Final post-shell vertex ceiling (pinned by rhodonea.test.ts). */
export const RHODONEA_VERTEX_CAP = 130000;
/**
 * Pre-shell surface budget: solidify() ~doubles the vertex count, so the base
 * surface is capped at half the final ceiling to keep the post-shell mesh <=cap.
 */
const RHODONEA_SURFACE_CAP = 65000;

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
  if (estimate > RHODONEA_SURFACE_CAP) {
    const shrink = Math.sqrt(RHODONEA_SURFACE_CAP / estimate);
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

  // Guard a palette-less record (e.g. the share mapper passes `undefined` when
  // json.palette is absent) — mirrors superformula.ts. Falls back to the HSB
  // ramp below instead of throwing (never-throws render contract).
  const hasPalette = palette != null && palette.stops != null && palette.stops.length > 0;
  // Perf: parse palette stops to linear RGB once, then numeric-lerp per row.
  const prepared: RgbStop[] | null = hasPalette ? prepareStops(palette.stops) : null;
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
      if (prepared) {
        // Bright-tips sampling: catalog palettes ascend bright(pos0)->dark(pos1),
        // so sample at (1 - u) — the petal tip (u=1) lands on the bright pos-0
        // stop instead of the darkest stop that vanished into the scene.
        // Reconciliation #8: no per-shape shifts re-applied (palette is baked).
        sampleStopsInto(prepared, 1 - u, scratch);
        // Guarantee the outermost (tip) row separates from the dark background.
        if (iu === lengthSeg) liftValueFloor(scratch, EDGE_VALUE_FLOOR);
      } else {
        // HSB fallback (v1 identity): hue rotates per petal, sat/bri ramp along u.
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

  // Small deep dome where the petals converge at the origin, coloured with the
  // deep inner stop (pos-1 under the reversed sampling). Appended after the base.
  const innerColor = prepared
    ? new THREE.Color().setRGB(
        prepared[prepared.length - 1].r,
        prepared[prepared.length - 1].g,
        prepared[prepared.length - 1].b,
      )
    : scratch.clone();
  addCenterDome(positions, colors, filteredIndices, {
    radius: Math.max(4, radius * 0.08),
    height: Math.max(4, heightProfile * 0.25),
    color: innerColor,
    up: "y",
    baseOffset: 0,
    stamens: 6,
  });

  // Petal thickness: append a normal-offset backing shell after the base surface.
  const solid = solidify(positions, colors, filteredIndices, SHELL_THICKNESS);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(solid.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(solid.colors, 3));
  geometry.setIndex(solid.indices);
  geometry.computeVertexNormals();
  return geometry;
}
