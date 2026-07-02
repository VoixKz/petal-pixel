import { describe, it, expect } from "vitest";
import { stitchQuads, filterZeroAreaTriangles } from "@/math/flowers/stitch";

describe("stitchQuads", () => {
  it("produces 6 indices (2 triangles) for a 2x2 grid of 4 valid vertices", () => {
    // 2x2 grid: each cell [row][col] holds a flat vertex index
    // Grid:
    //   0--1
    //   |  |
    //   2--3
    const indexGrid = [
      [0, 1],
      [2, 3],
    ];
    const indices: number[] = [];
    stitchQuads(indexGrid, indices);
    // One quad => 2 triangles => 6 indices
    expect(indices.length).toBe(6);
    // Both triangles should cover the quad (0,1,2,3)
    const set = new Set(indices);
    expect(set.has(0)).toBe(true);
    expect(set.has(1)).toBe(true);
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(true);
  });

  it("skips cells where any corner index is negative (sentinel -1)", () => {
    // 2x2 grid, but one corner is -1 (degenerate/missing vertex)
    const indexGrid = [
      [-1, 1],
      [2, 3],
    ];
    const indices: number[] = [];
    stitchQuads(indexGrid, indices);
    // The single quad has a -1 corner → both triangles skipped
    expect(indices.length).toBe(0);
  });

  it("handles a 2x3 grid producing 2 quads (4 triangles, 12 indices)", () => {
    // 2 rows × 3 cols → 1×2 = 2 quad cells
    // Grid:
    //   0--1--2
    //   |  |  |
    //   3--4--5
    const indexGrid = [
      [0, 1, 2],
      [3, 4, 5],
    ];
    const indices: number[] = [];
    stitchQuads(indexGrid, indices);
    expect(indices.length).toBe(12); // 2 quads × 2 tris × 3 indices
  });

  it("emits no triangles when all four corners share one index (all-equal)", () => {
    const indexGrid = [
      [0, 0],
      [0, 0],
    ];
    const indices: number[] = [];
    stitchQuads(indexGrid, indices);
    expect(indices.length).toBe(0);
  });

  it("skips a triangle when ANY TWO corners coincide (pole/collapsed-row sliver)", () => {
    // A collapsed top row (both top corners = pole index 0) with a distinct bottom edge.
    //   0--0
    //   |  |
    //   1--2
    // Triangle 1 (tl=0, bl=1, tr=0): tl===tr → skipped.
    // Triangle 2 (tr=0, bl=1, br=2): all distinct → kept (3 indices).
    const indexGrid = [
      [0, 0],
      [1, 2],
    ];
    const indices: number[] = [];
    stitchQuads(indexGrid, indices);
    expect(indices).toEqual([0, 1, 2]);
  });
});

describe("filterZeroAreaTriangles", () => {
  it("drops triangles with distinct indices but (near-)coincident positions", () => {
    // 4 vertices: 0,1 at the same spot (pinched), 2 and 3 distinct.
    const positions = [
      0, 0, 0, // v0
      0, 0, 0, // v1 (coincident with v0)
      1, 0, 0, // v2
      0, 1, 0, // v3
    ];
    // Tri A (0,1,2) has a zero-length edge 0-1 → zero area → dropped.
    // Tri B (0,2,3) is a real right triangle → kept.
    const indices = [0, 1, 2, 0, 2, 3];
    const kept = filterZeroAreaTriangles(positions, indices);
    expect(kept).toEqual([0, 2, 3]);
  });

  it("keeps all triangles when every triangle has real area", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const indices = [0, 1, 2];
    expect(filterZeroAreaTriangles(positions, indices)).toEqual([0, 1, 2]);
  });

  it("handles an empty grid without error", () => {
    const indices: number[] = [];
    stitchQuads([], indices);
    expect(indices.length).toBe(0);
  });

  it("handles a single-row or single-column grid (no quads possible)", () => {
    const singleRow = [[0, 1, 2]];
    const indices: number[] = [];
    stitchQuads(singleRow, indices);
    // 1 row → 0 quad rows → 0 indices
    expect(indices.length).toBe(0);
  });
});
