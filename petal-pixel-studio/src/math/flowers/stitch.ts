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
 * vertex).  Zero-area triangles — where two or more corners share the same
 * index — are detected via index equality and skipped (index-space proxy for
 * |cross| < 1e-6 in world space; geometry tasks that need world-space area
 * checks should post-filter independently).
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

      // Triangle 1: tl, bl, tr  (upper-left triangle of the quad)
      // Skip if zero-area (all three indices identical).
      if (!(tl === bl && bl === tr)) {
        indices.push(tl, bl, tr);
      }

      // Triangle 2: tr, bl, br  (lower-right triangle of the quad)
      if (!(tr === bl && bl === br)) {
        indices.push(tr, bl, br);
      }
    }
  }
}
