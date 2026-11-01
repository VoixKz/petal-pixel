import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { solidify, SHELL_THICKNESS } from "@/math/flowers/shell";

// A single flat unit quad on the z=0 plane. Its vertex normals are ±z, so the
// back layer offsets purely in z by ±thickness.
const QUAD_POS = [
  0, 0, 0, // 0
  1, 0, 0, // 1
  1, 1, 0, // 2
  0, 1, 0, // 3
];
const QUAD_COL = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
  1, 1, 0,
];
const QUAD_IDX = [0, 1, 2, 0, 2, 3];

describe("solidify (backing-shell helper)", () => {
  it("doubles the vertex count (front + back layer)", () => {
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), 2);
    expect(out.positions.length / 3).toBe(8); // 4 front + 4 back
    expect(out.colors.length / 3).toBe(8);
  });

  it("does not mutate the input arrays (append-after-base)", () => {
    const pos = QUAD_POS.slice();
    const col = QUAD_COL.slice();
    const idx = QUAD_IDX.slice();
    solidify(pos, col, idx, 2);
    expect(pos).toEqual(QUAD_POS);
    expect(col).toEqual(QUAD_COL);
    expect(idx).toEqual(QUAD_IDX);
  });

  it("preserves the front vertices verbatim (front block unchanged)", () => {
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), 2);
    for (let i = 0; i < QUAD_POS.length; i += 1) {
      expect(out.positions[i]).toBe(QUAD_POS[i]);
      expect(out.colors[i]).toBe(QUAD_COL[i]);
    }
  });

  it("offsets the back layer by thickness along the (±z) surface normal", () => {
    const thickness = 2;
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), thickness);
    // Back vertex i sits at front-xy, front-z ± thickness (normal is ±z here).
    for (let i = 0; i < 4; i += 1) {
      const bx = out.positions[(4 + i) * 3];
      const by = out.positions[(4 + i) * 3 + 1];
      const bz = out.positions[(4 + i) * 3 + 2];
      expect(bx).toBeCloseTo(QUAD_POS[i * 3], 6);
      expect(by).toBeCloseTo(QUAD_POS[i * 3 + 1], 6);
      expect(Math.abs(bz)).toBeCloseTo(thickness, 6);
    }
  });

  it("copies each back vertex colour from its front vertex", () => {
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), 2);
    for (let i = 0; i < 4; i += 1) {
      expect(out.colors[(4 + i) * 3]).toBe(QUAD_COL[i * 3]);
      expect(out.colors[(4 + i) * 3 + 1]).toBe(QUAD_COL[i * 3 + 1]);
      expect(out.colors[(4 + i) * 3 + 2]).toBe(QUAD_COL[i * 3 + 2]);
    }
  });

  it("adds back faces + rim quads (index count grows past the original)", () => {
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), 2);
    // front: 6, back: 6, rim: 4 boundary edges * 6 = 24 -> 36 total.
    expect(out.indices.length).toBeGreaterThan(QUAD_IDX.length);
    expect(out.indices.length).toBe(36);
    expect(out.indices.length % 3).toBe(0);
  });

  it("produces only finite positions and finite-area triangles", () => {
    const out = solidify(QUAD_POS.slice(), QUAD_COL.slice(), QUAD_IDX.slice(), 2);
    for (const v of out.positions) expect(Number.isFinite(v)).toBe(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const p = out.positions;
    for (let i = 0; i < out.indices.length; i += 3) {
      a.set(p[out.indices[i] * 3], p[out.indices[i] * 3 + 1], p[out.indices[i] * 3 + 2]);
      b.set(p[out.indices[i + 1] * 3], p[out.indices[i + 1] * 3 + 1], p[out.indices[i + 1] * 3 + 2]);
      c.set(p[out.indices[i + 2] * 3], p[out.indices[i + 2] * 3 + 1], p[out.indices[i + 2] * 3 + 2]);
      ab.subVectors(b, a); ac.subVectors(c, a);
      const area = ab.cross(ac).length() * 0.5;
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThan(0);
    }
  });

  it("exports a sane default thickness", () => {
    expect(SHELL_THICKNESS).toBeGreaterThan(0);
    expect(SHELL_THICKNESS).toBeLessThanOrEqual(5);
  });
});
