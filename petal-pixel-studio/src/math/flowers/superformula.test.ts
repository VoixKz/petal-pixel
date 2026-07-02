import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { superShape } from "@/math/supplement";
import { createSuperformulaGeometry } from "@/math/flowers/superformula";
import type { SuperformulaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

// Representative mid-range params (within the canonical generator ranges).
const PARAMS: SuperformulaParams = {
  scale: 300,
  m1: 8, n1a: 0.6, n2a: 1.0, n3a: 1.0, a1: 1.0, b1: 1.0,
  m2: 4, n1b: 1.0, n2b: 1.0, n3b: 1.0, a2: 1.0, b2: 1.0,
  uSeg: 160, vSeg: 100,
  satShift: 0, briShift: 0,
};

const PALETTE: Palette = {
  id: "test_grad",
  stops: [
    { pos: 0, hex: "#ff0000" },
    { pos: 1, hex: "#0000ff" },
  ],
};

// Smallest triangle area across the whole index buffer.
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

describe("superShape", () => {
  it("returns a finite positive radius for representative inputs", () => {
    // circle-ish (m=0 -> t=0 -> |cos0|^n2 + |sin0|^n3 with sin0=0)
    expect(Number.isFinite(superShape(0, 0, 1, 1, 1, 1, 1))).toBe(true);
    const samples = [
      superShape(0, 8, 0.6, 1, 1, 1, 1),
      superShape(Math.PI / 3, 8, 0.6, 1, 1, 1, 1),
      superShape(-Math.PI / 2, 4, 1, 1, 1, 1, 1),
      superShape(Math.PI, 6, 0.5, 1.5, 1.5, 1.1, 0.9),
    ];
    for (const r of samples) {
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("returns 0 (not NaN/Infinity) for degenerate exponents", () => {
    // n1,a,b clamped >=1e-3; inner<=1e-9 collapses to 0 rather than Infinity.
    const r = superShape(Math.PI / 4, 8, 0, 6, 6, 0, 0);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe("createSuperformulaGeometry", () => {
  it("produces a BufferGeometry with position, color and index attributes", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    expect(geom).toBeInstanceOf(THREE.BufferGeometry);
    expect(geom.getAttribute("position")).toBeTruthy();
    expect(geom.getAttribute("color")).toBeTruthy();
    expect(geom.getAttribute("normal")).toBeTruthy(); // computeVertexNormals ran
    expect(geom.getIndex()).toBeTruthy();
    const pos = geom.getAttribute("position");
    const col = geom.getAttribute("color");
    expect(pos.count).toBeGreaterThan(0);
    expect(col.count).toBe(pos.count); // one color per vertex
  });

  it("has no NaN in any vertex position or color", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const pos = geom.getAttribute("position").array;
    const col = geom.getAttribute("color").array;
    for (let i = 0; i < pos.length; i += 1) expect(Number.isFinite(pos[i])).toBe(true);
    for (let i = 0; i < col.length; i += 1) expect(Number.isFinite(col[i])).toBe(true);
  });

  it("emits only strictly positive-area triangles (poles/degenerates skipped)", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    expect(geom.getIndex()!.count).toBeGreaterThan(0);
    expect(minTriangleArea(geom)).toBeGreaterThan(1e-6);
  });

  it("keeps every vertex within a bound of ~2*scale", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const pos = geom.getAttribute("position");
    const bound = 2 * PARAMS.scale;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      expect(v.length()).toBeLessThanOrEqual(bound);
    }
  });

  it("honors the vertex cap (shrinks uSeg/vSeg when the grid would exceed MAX)", () => {
    const huge = createSuperformulaGeometry({ ...PARAMS, uSeg: 340, vSeg: 200 }, PALETTE);
    expect(huge.getAttribute("position").count).toBeLessThanOrEqual(130000);
  });

  it("colors vertices from the palette (not all identical)", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const col = geom.getAttribute("color");
    const first = new THREE.Color().fromBufferAttribute(col, 0);
    let differs = false;
    for (let i = 1; i < col.count; i += 1) {
      const c = new THREE.Color().fromBufferAttribute(col, i);
      if (Math.abs(c.r - first.r) > 1e-4 || Math.abs(c.b - first.b) > 1e-4) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });
});
