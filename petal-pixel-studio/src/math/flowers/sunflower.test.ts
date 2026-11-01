import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createSunflowerGeometry } from "@/math/flowers/sunflower";
import type { SunflowerParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "golden_hour",
  stops: [
    { pos: 0, hex: "#5a3a12" },
    { pos: 0.55, hex: "#e8a838" },
    { pos: 1, hex: "#fff2b0" },
  ],
};

// Mid-range params inside the canonical SUNFLOWER range table (plan lines 377-380).
const PARAMS: SunflowerParams = {
  scale: 300,
  floretRings: 90,
  floretSpokes: 220,
  domeHeight: 45,
  discRatio: 0.58,
  rayPetals: 34,
  rayLength: 0.5,
  rayWidth: 0.8,
  seedPacking: 1.0,
  satShift: 0,
  briShift: 0,
};

const VERTEX_CAP = 130000;

function minTriangleArea(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) throw new Error("geometry has no index");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let min = Infinity;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const area = ab.cross(ac).length() * 0.5;
    if (area < min) min = area;
  }
  return min;
}

describe("createSunflowerGeometry", () => {
  it("returns a BufferGeometry with position + color attributes", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    expect(pos).toBeTruthy();
    expect(color).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
    // one RGB triple per vertex
    expect(color.count).toBe(pos.count);
    expect(color.itemSize).toBe(3);
  });

  it("contains no NaN in positions or colors", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position").array as Float32Array;
    const color = geometry.getAttribute("color").array as Float32Array;
    // Aggregate to a single assert: the shell doubles the vertex count, so a
    // per-element expect() loop times out at 20s. (perf-split later applies this
    // same aggregation project-wide.)
    let bad = false;
    for (let i = 0; i < pos.length; i += 1) if (Number.isNaN(pos[i])) { bad = true; break; }
    for (let i = 0; i < color.length && !bad; i += 1) if (Number.isNaN(color[i])) { bad = true; break; }
    expect(bad).toBe(false);
  });

  it("emits only strictly positive-area triangles", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    expect(geometry.getIndex()).toBeTruthy();
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });

  it("stays within the 130k vertex cap even at maximum resolution (post-shell)", () => {
    const dense: SunflowerParams = {
      ...PARAMS,
      floretRings: 150,
      floretSpokes: 320,
      rayPetals: 55,
    };
    const geometry = createSunflowerGeometry(dense, PALETTE);
    expect(geometry.getAttribute("position").count).toBeLessThanOrEqual(VERTEX_CAP);
    expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("adds a backing shell (vertex count doubled, colors copied per vertex)", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    // solidify() appends a back layer of equal size -> total is exactly even,
    // and each back vertex carries a copied color.
    expect(pos.count % 2).toBe(0);
    expect(color.count).toBe(pos.count);
    // Post-shell it comfortably exceeds a bare single-sided surface.
    expect(pos.count).toBeGreaterThan(1000);
  });

  it("makes the outermost ray-petal tips bright (edge-brightness floor)", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    // Find the vertex with the largest planar radius (a ray-petal tip / rim).
    let maxR = -1;
    let idx = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > maxR) { maxR = r; idx = i; }
    }
    const v = Math.max(color.getX(idx), color.getY(idx), color.getZ(idx));
    expect(v).toBeGreaterThanOrEqual(0.55 - 1e-6);
  });

  it("degrades gracefully at degenerate params (ray_petals below floor, tiny grid)", () => {
    const degenerate: SunflowerParams = {
      ...PARAMS,
      floretRings: 40,
      floretSpokes: 120,
      rayPetals: 1, // below the >=3 floor -> clamped, must not throw / NaN
      domeHeight: 0,
      seedPacking: 0.7,
    };
    const geometry = createSunflowerGeometry(degenerate, PALETTE);
    const pos = geometry.getAttribute("position").array as Float32Array;
    let bad = false;
    for (let i = 0; i < pos.length; i += 1) if (Number.isNaN(pos[i])) { bad = true; break; }
    expect(bad).toBe(false);
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });
});
