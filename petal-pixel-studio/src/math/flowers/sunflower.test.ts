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
    for (let i = 0; i < pos.length; i += 1) expect(Number.isNaN(pos[i])).toBe(false);
    for (let i = 0; i < color.length; i += 1) expect(Number.isNaN(color[i])).toBe(false);
  });

  it("emits only strictly positive-area triangles", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    expect(geometry.getIndex()).toBeTruthy();
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });

  it("stays within the 130k vertex cap even at maximum resolution", () => {
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
    for (let i = 0; i < pos.length; i += 1) expect(Number.isNaN(pos[i])).toBe(false);
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });
});
