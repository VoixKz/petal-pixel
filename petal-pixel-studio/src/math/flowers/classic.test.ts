import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createClassicFlowerGeometry } from "@/math/flowers/classic";
import { DEFAULT_CLASSIC_PARAMS } from "@/math/flowerTypes";

// Geometry inspection helper: smallest triangle area across the whole index buffer.
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

describe("createClassicFlowerGeometry", () => {
  it("produces no zero-area (degenerate) triangles in any row, including the first", () => {
    const geometry = createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS);
    // Every triangle must have a strictly positive area; the old code fanned
    // the entire first row from a single coincident point at theta=0.
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });

  it("has no whole coincident row at the geometry center (r=0 fan removed)", () => {
    const geometry = createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS);
    const pos = geometry.getAttribute("position");
    const { cols } = DEFAULT_CLASSIC_PARAMS;
    // Count vertices sitting exactly on the x=y=0 axis; the degenerate build
    // put an entire row (cols vertices) there.
    let onAxis = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(pos.getX(i)) < 1e-9 && Math.abs(pos.getY(i)) < 1e-9) onAxis += 1;
    }
    expect(onAxis).toBeLessThan(cols);
  });
});
