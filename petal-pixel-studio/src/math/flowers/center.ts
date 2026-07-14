import * as THREE from "three";

export interface CenterDomeOptions {
  /** Ring radius of the dome base, in model units. */
  radius: number;
  /** Apex rise above the base ring plane, along the up-axis. */
  height: number;
  /** Ring subdivisions (>= 6). */
  segments?: number;
  /** Fill colour for every appended vertex — the deep inner palette stop. */
  color: THREE.Color;
  /** Height axis: "y" for XZ-plane families (rose/bloom), "z" for classic. */
  up?: "y" | "z";
  /** Coordinate of the base-ring plane along the up-axis (where the hole sits). */
  baseOffset?: number;
  /** Number of short stamen spikes clustered near the apex. */
  stamens?: number;
  /** Stamen spike length above the apex (defaults to ~1.6*height). */
  stamenHeight?: number;
}

/**
 * Append a small domed disc (apex + one ring, triangle-fanned) plus a few short
 * stamen spikes to close/fill a flower centre. Everything is coloured with the
 * deep inner stop and merged into the SAME position/color/index arrays, so the
 * result is one indexed geometry with a single per-vertex `color` attribute
 * (no separate mesh/attribute — ren-material applies its material uniformly).
 *
 * CONTRACT — append-after-base invariant: all vertices are pushed AFTER the
 * existing block, so callers indexing the base surface by row keep valid indices.
 * Mutates the arrays in place; returns the number of vertices appended.
 */
export function addCenterDome(
  positions: number[],
  colors: number[],
  indices: number[],
  opts: CenterDomeOptions,
): number {
  const { radius, height, color } = opts;
  const segments = Math.max(6, Math.round(opts.segments ?? 16));
  const up = opts.up ?? "y";
  const baseOffset = opts.baseOffset ?? 0;
  const stamens = Math.max(0, Math.round(opts.stamens ?? 6));
  const stamenHeight = opts.stamenHeight ?? height * 1.6;

  const startCount = positions.length / 3;
  const cr = color.r;
  const cg = color.g;
  const cb = color.b;

  // Push a vertex given a radial distance + angle in the plane perpendicular to
  // `up`, and a lift along `up`. Returns its index.
  const put = (radial: number, angle: number, lift: number): number => {
    const px = radial * Math.cos(angle);
    const py = radial * Math.sin(angle);
    let x: number;
    let y: number;
    let z: number;
    if (up === "z") {
      x = px;
      y = py;
      z = baseOffset + lift;
    } else {
      x = px;
      z = py;
      y = baseOffset + lift;
    }
    const idx = positions.length / 3;
    positions.push(x, y, z);
    colors.push(cr, cg, cb);
    return idx;
  };

  // Apex on the axis, then one ring at the base plane; fan the apex to the ring.
  const apex = put(0, 0, height);
  const ring: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    ring.push(put(radius, (2 * Math.PI * i) / segments, 0));
  }
  for (let i = 0; i < segments; i += 1) {
    indices.push(apex, ring[i], ring[(i + 1) % segments]);
  }

  // Stamen spikes: short raised triangles clustered near the apex.
  const dA = Math.PI / segments;
  for (let s = 0; s < stamens; s += 1) {
    const a = (2 * Math.PI * s) / stamens;
    const rr = radius * 0.35;
    const base1 = put(rr, a - dA, height * 0.4);
    const base2 = put(rr, a + dA, height * 0.4);
    const tip = put(rr * 0.55, a, height + stamenHeight);
    indices.push(base1, base2, tip);
  }

  return positions.length / 3 - startCount;
}
