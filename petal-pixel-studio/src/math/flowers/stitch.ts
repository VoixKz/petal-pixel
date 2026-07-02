/**
 * Shared quad stitcher — used by Tasks 6-9 (sunflower, rhodonea, superformula,
 * and any future surface-of-revolution generators).
 *
 * Iterates a row-major index grid and pushes triangle indices into the provided
 * `indices` array in-place (no allocation beyond the pushes).
 *
 * Each quad cell (row r, col c) is formed by four corners:
 *   tl = indexGrid[r  ][c  ]
 *   tr = indexGrid[r  ][c+1]
 *   bl = indexGrid[r+1][c  ]
 *   br = indexGrid[r+1][c+1]
 *
 * A cell is skipped if any corner index is < 0 (sentinel for a missing/pole
 * vertex).  A triangle is skipped when ANY TWO of its three corners share the
 * same index — that edge has zero length, so the triangle is degenerate. This
 * catches the common pole/collapsed-row slivers (two-equal), not just the
 * all-three-equal case.
 *
 * Index equality cannot catch triangles whose corners have DISTINCT indices but
 * COINCIDENT positions (e.g. a petal base/tip where the surface pinches). For
 * those, call `filterZeroAreaTriangles(positions, indices)` after stitching.
 */
export function stitchQuads(indexGrid: number[][], indices: number[]): void {
  const rows = indexGrid.length;
  if (rows < 2) return;

  for (let r = 0; r < rows - 1; r++) {
    const rowA = indexGrid[r];
    const rowB = indexGrid[r + 1];
    const cols = rowA.length;
    if (cols < 2) continue;

    for (let c = 0; c < cols - 1; c++) {
      const tl = rowA[c];
      const tr = rowA[c + 1];
      const bl = rowB[c];
      const br = rowB[c + 1];

      // Skip cells with any sentinel index.
      if (tl < 0 || tr < 0 || bl < 0 || br < 0) continue;

      // Triangle 1: tl, bl, tr — skip if any two corners coincide (zero-area).
      if (tl !== bl && bl !== tr && tl !== tr) {
        indices.push(tl, bl, tr);
      }

      // Triangle 2: tr, bl, br — skip if any two corners coincide (zero-area).
      if (tr !== bl && bl !== br && tr !== br) {
        indices.push(tr, bl, br);
      }
    }
  }
}

/**
 * World-space degenerate-triangle filter, shared by the v2 family builders.
 * Returns a new index array with triangles whose area is < `epsilon` removed —
 * catching pinched petal base/tip triangles that have distinct indices but
 * (near-)coincident positions, which `stitchQuads`'s index check cannot see.
 *
 * `positions` is the flat [x,y,z, x,y,z, ...] buffer; `indices` is a flat list
 * of triangle corner indices (length a multiple of 3).
 */
export function filterZeroAreaTriangles(
  positions: number[] | Float32Array,
  indices: number[],
  epsilon = 1e-6,
): number[] {
  const kept: number[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    // edge1 = B - A, edge2 = C - A
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];

    // area = 0.5 * |edge1 x edge2|
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);

    if (area >= epsilon) {
      kept.push(indices[i], indices[i + 1], indices[i + 2]);
    }
  }
  return kept;
}
