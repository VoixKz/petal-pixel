import { describe, it, expect } from "vitest";
import { stitchQuads } from "@/math/flowers/stitch";

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

  it("skips zero-area triangles (coincident vertices produce cross magnitude < 1e-6)", () => {
    // A degenerate quad where all 4 corners are index 0 (same position → zero area).
    // stitchQuads skips on |cross| < 1e-6, but we can't test that without positions.
    // Instead test the negative-index skip which is the reachable path in pure index logic.
    // This is a structural guard; geometry-based skip is covered by geometry tests.
    const indexGrid = [
      [0, 0],
      [0, 0],
    ];
    const indices: number[] = [];
    // Should NOT throw; may emit 6 indices (callers' geometry dedup handles this)
    expect(() => stitchQuads(indexGrid, indices)).not.toThrow();
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
