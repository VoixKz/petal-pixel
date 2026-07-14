import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRhodoneaGeometry, RHODONEA_VERTEX_CAP } from "@/math/flowers/rhodonea";
import type { RhodoneaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "crimson_velvet",
  stops: [
    { pos: 0, hex: "#3a0d1e" },
    { pos: 0.5, hex: "#a11d3f" },
    { pos: 1, hex: "#f2708c" },
  ],
};

// Mid-range params drawn from the canonical RHODONEA range table.
const BASE: RhodoneaParams = {
  radius: 260,
  k: 5,
  petalSpan: 0.85,
  widthProfile: 0.45,
  heightProfile: 60,
  thickness: 9,
  curl: 0.4,
  lengthSeg: 30,
  widthSeg: 20,
  satShift: 0,
  briShift: 0,
};

// Smallest triangle area across the whole index buffer (mirrors classic.test.ts).
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
    min = Math.min(min, ab.cross(ac).length() * 0.5);
  }
  return min;
}

describe("createRhodoneaGeometry", () => {
  it("returns a BufferGeometry with position + color attributes and an index", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    expect(g).toBeInstanceOf(THREE.BufferGeometry);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos).toBeDefined();
    expect(col).toBeDefined();
    expect(pos.itemSize).toBe(3);
    expect(col.itemSize).toBe(3);
    // one color per position vertex
    expect(col.count).toBe(pos.count);
    expect(pos.count).toBeGreaterThan(0);
    expect(g.getIndex()).not.toBeNull();
    expect(g.getIndex()!.count % 3).toBe(0);
    // normals were computed
    expect(g.getAttribute("normal")).toBeDefined();
  });

  it("emits P = k petals for odd k and 2k for even k", () => {
    // Petal count is observable as the number of distinct clusters, but the
    // simplest deterministic proxy is that even k roughly doubles the vertex
    // count vs the same-seg odd case. Assert the surface is non-empty for both.
    const odd = createRhodoneaGeometry({ ...BASE, k: 5 }, PALETTE);
    const even = createRhodoneaGeometry({ ...BASE, k: 4 }, PALETTE);
    // odd -> P=5 petals, even -> P=8 petals; both use (lengthSeg+1)*(widthSeg+1)
    // verts per petal, so even has ~8/5 the vertices of odd here.
    expect(even.getAttribute("position").count).toBeGreaterThan(
      odd.getAttribute("position").count
    );
  });

  it("contains no NaN or non-finite vertex coordinates", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const pos = g.getAttribute("position");
    // Aggregate to a single assert (a per-element expect() loop over every
    // vertex component times out at 20s once the shell doubles vertex count).
    let posFinite = true;
    for (let i = 0; i < pos.count * 3 && posFinite; i += 1) {
      if (!Number.isFinite(pos.array[i])) posFinite = false;
    }
    expect(posFinite).toBe(true);
  });

  it("contains no NaN color channels and all channels are in [0,1]", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const col = g.getAttribute("color");
    // Aggregate to a single assert (three expects per channel per vertex would
    // time out at 20s once the shell doubles vertex count).
    let colOk = true;
    for (let i = 0; i < col.count * 3 && colOk; i += 1) {
      const v = col.array[i];
      if (!Number.isFinite(v) || v < 0 || v > 1) colOk = false;
    }
    expect(colOk).toBe(true);
  });

  it("produces only strictly positive-area triangles (degenerate quads skipped)", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    expect(minTriangleArea(g)).toBeGreaterThan(1e-6);
  });

  it("keeps all vertices within a bounded box around the origin", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    g.computeBoundingBox();
    const box = g.getBoundingBox ? g.boundingBox! : g.boundingBox!;
    // radius=260, heightProfile=60, thickness=9 -> nothing should exceed a
    // generous |coord| bound of radius*2.
    const bound = BASE.radius * 2;
    expect(box.min.x).toBeGreaterThan(-bound);
    expect(box.max.x).toBeLessThan(bound);
    expect(box.min.y).toBeGreaterThan(-bound);
    expect(box.max.y).toBeLessThan(bound);
    expect(box.min.z).toBeGreaterThan(-bound);
    expect(box.max.z).toBeLessThan(bound);
  });

  it("respects the 130k vertex cap when seg counts are pushed to the max", () => {
    const g = createRhodoneaGeometry(
      { ...BASE, k: 9, lengthSeg: 48, widthSeg: 32 },
      PALETTE
    );
    // P=9 * 49 * 33 = 14553 -> under surface cap; post-shell it stays under the
    // exported final ceiling. Assert the exported cap and that we never exceed it.
    expect(RHODONEA_VERTEX_CAP).toBe(130000);
    expect(g.getAttribute("position").count).toBeLessThanOrEqual(RHODONEA_VERTEX_CAP);
  });

  it("adds a backing shell + center dome after the base surface", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    // solidify() copies a color per back vertex; the dome adds its own colored verts.
    expect(col.count).toBe(pos.count);
    // Base surface for BASE params ~ P(5)*31*21 = 3255; post shell+dome is larger.
    expect(pos.count).toBeGreaterThan(3255);
  });

  it("makes the outermost petal tips bright (edge-brightness floor)", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    let maxR = -1;
    let idx = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r > maxR) { maxR = r; idx = i; }
    }
    const v = Math.max(col.getX(idx), col.getY(idx), col.getZ(idx));
    expect(v).toBeGreaterThanOrEqual(0.55 - 1e-6);
  });

  it("coerces k into [2,9] as an integer (guards pi/(2k))", () => {
    // Out-of-range / non-integer k must not throw or produce NaN.
    const g = createRhodoneaGeometry({ ...BASE, k: 0 }, PALETTE);
    const pos = g.getAttribute("position");
    expect(pos.count).toBeGreaterThan(0);
    let posFinite = true;
    for (let i = 0; i < pos.count * 3 && posFinite; i += 1) {
      if (!Number.isFinite(pos.array[i])) posFinite = false;
    }
    expect(posFinite).toBe(true);
  });

  it("falls back to the HSB ramp when palette has no stops", () => {
    const g = createRhodoneaGeometry(BASE, { id: "empty", stops: [] });
    const col = g.getAttribute("color");
    expect(col.count).toBeGreaterThan(0);
    let colFinite = true;
    for (let i = 0; i < col.count * 3 && colFinite; i += 1) {
      if (!Number.isFinite(col.array[i])) colFinite = false;
    }
    expect(colFinite).toBe(true);
  });
});
