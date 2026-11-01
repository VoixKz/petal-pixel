import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { addCenterDome } from "@/math/flowers/center";

function positiveAreaTriangles(pos: number[], idx: number[]): number {
  let count = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.set(pos[idx[i] * 3], pos[idx[i] * 3 + 1], pos[idx[i] * 3 + 2]);
    b.set(pos[idx[i + 1] * 3], pos[idx[i + 1] * 3 + 1], pos[idx[i + 1] * 3 + 2]);
    c.set(pos[idx[i + 2] * 3], pos[idx[i + 2] * 3 + 1], pos[idx[i + 2] * 3 + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    if (ab.cross(ac).length() * 0.5 > 1e-6) count += 1;
  }
  return count;
}

describe("addCenterDome", () => {
  const color = new THREE.Color(0.2, 0.02, 0.08); // a deep inner stop

  it("appends vertices after the existing base (append-after-base)", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]; // 3 pre-existing base verts
    const colors = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const indices = [0, 1, 2];
    const added = addCenterDome(positions, colors, indices, { radius: 5, height: 3, color });
    expect(added).toBeGreaterThan(0);
    expect(positions.length / 3).toBe(3 + added);
    // the first 3 base verts are untouched
    expect(positions.slice(0, 9)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(colors.slice(0, 9)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("produces at least one positive-area triangle and an axis apex vertex", () => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    addCenterDome(positions, colors, indices, { radius: 5, height: 3, color, up: "y" });
    expect(positiveAreaTriangles(positions, indices)).toBeGreaterThanOrEqual(1);
    // apex sits on the axis: x≈0, z≈0 (y-up), raised above the base plane.
    const apexX = positions[0], apexY = positions[1], apexZ = positions[2];
    expect(Math.hypot(apexX, apexZ)).toBeLessThan(1e-9);
    expect(apexY).toBeCloseTo(3, 6);
  });

  it("colours every appended vertex with the deep inner stop", () => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    addCenterDome(positions, colors, indices, { radius: 5, height: 3, color });
    for (let i = 0; i < colors.length; i += 3) {
      expect(colors[i]).toBeCloseTo(color.r, 6);
      expect(colors[i + 1]).toBeCloseTo(color.g, 6);
      expect(colors[i + 2]).toBeCloseTo(color.b, 6);
    }
  });

  it("supports a z-up axis (classic) with a base offset", () => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    addCenterDome(positions, colors, indices, {
      radius: 3, height: 8, color, up: "z", baseOffset: -199,
    });
    // apex on the z axis, raised above baseOffset
    expect(Math.hypot(positions[0], positions[1])).toBeLessThan(1e-9);
    expect(positions[2]).toBeCloseTo(-199 + 8, 6);
    // finite everywhere
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });
});
