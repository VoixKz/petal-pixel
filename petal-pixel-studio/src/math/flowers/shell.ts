import * as THREE from "three";

/**
 * Default backing-shell thickness in model units (~1% of a typical flower
 * radius of 250–300). Tune 1–3 during manual verification.
 */
export const SHELL_THICKNESS = 2;

/**
 * "Solidify" a single-sided surface into a thin two-sided shell so petals read
 * as physical objects (visible rim, lit backs) instead of paper-thin sheets.
 *
 * It appends a back layer (each front vertex offset by `-thickness * vertexNormal`)
 * with reversed winding, plus rim quads bridging the front and back along every
 * boundary edge (an edge used by exactly one front triangle). Colours are copied
 * from the corresponding front vertex.
 *
 * CONTRACT — append-after-base invariant: the back-layer and rim vertices are
 * appended AFTER the entire front block, so every existing front-vertex index is
 * unchanged. Callers that index into the surface by row (e.g. rose row*601) stay
 * valid. Returns fresh arrays; inputs are not mutated.
 */
export function solidify(
  positions: number[],
  colors: number[],
  indices: number[],
  thickness: number,
): { positions: number[]; colors: number[]; indices: number[] } {
  const nFront = positions.length / 3;

  // Vertex normals of the front surface, used to offset the back layer inward.
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions.slice(), 3));
  g.setIndex(indices.slice());
  g.computeVertexNormals();
  const nrm = g.getAttribute("normal");

  const outPos = positions.slice();
  const outCol = colors.slice();
  const outIdx = indices.slice();

  // Back layer: offset each front vertex by -thickness*normal, copy its colour.
  for (let i = 0; i < nFront; i += 1) {
    outPos.push(
      positions[i * 3] - nrm.getX(i) * thickness,
      positions[i * 3 + 1] - nrm.getY(i) * thickness,
      positions[i * 3 + 2] - nrm.getZ(i) * thickness,
    );
    outCol.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
  }

  // Back faces: same triangles on the back layer, reversed winding so they face
  // outward from the shell.
  for (let i = 0; i < indices.length; i += 3) {
    outIdx.push(nFront + indices[i], nFront + indices[i + 2], nFront + indices[i + 1]);
  }

  // Boundary edges = edges used by exactly one front triangle. Use a numeric
  // key (min*nFront + max) instead of a string to keep this cheap on large
  // meshes (this runs per-triangle on the client, so avoid string alloc/GC).
  const edge = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * nFront + b : b * nFront + a);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const k0 = key(i0, i1);
    const k1 = key(i1, i2);
    const k2 = key(i2, i0);
    edge.set(k0, (edge.get(k0) ?? 0) + 1);
    edge.set(k1, (edge.get(k1) ?? 0) + 1);
    edge.set(k2, (edge.get(k2) ?? 0) + 1);
  }

  // Rim quads: bridge front edge (a,b) to back edge (a',b') on each boundary.
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if ((edge.get(key(a, b)) ?? 0) === 1) {
        outIdx.push(a, b, nFront + b, a, nFront + b, nFront + a);
      }
    }
  }

  return { positions: outPos, colors: outCol, indices: outIdx };
}
