import * as THREE from "three";
import type { RoseParams } from "@/math/flowerTypes";
import { degToRad, hsbToThreeColor } from "@/math/supplement";
import { samplePalette, liftValueFloor, EDGE_VALUE_FLOOR } from "@/math/palette";
import { solidify, SHELL_THICKNESS } from "@/math/flowers/shell";
import { addCenterDome } from "@/math/flowers/center";

const ROSE_COLS = 600;
const ROSE_ROWS = 30;
const ROSE_TD = (180 * 15) / ROSE_COLS;
const ROSE_RD = 1 / ROSE_ROWS;

export function getRoseFunctionProjections(params: RoseParams, options: {
  thetaSamples?: number;
  rowSamples?: number;
  thetaForHang?: number;
} = {}) {
  const thetaSamples = options.thetaSamples ?? 240;
  const rowSamples = options.rowSamples ?? 120;
  const thetaForHang = options.thetaForHang ?? ROSE_COLS * 0.35;

  const phiSeries: Array<{ x: number; y: number }> = [];
  const petalCutSeries: Array<{ x: number; y: number }> = [];
  const hangDownSeries: Array<{ x: number; y: number }> = [];

  const phiAtThetaForHang = (180 / params.opening) * Math.exp((-thetaForHang * ROSE_TD) / (params.vDensity * 180));

  for (let i = 0; i < thetaSamples; i += 1) {
    const theta = (i / Math.max(1, thetaSamples - 1)) * ROSE_COLS;
    const thetaDeg = theta * ROSE_TD;
    const phi = (180 / params.opening) * Math.exp((-thetaDeg) / (params.vDensity * 180));
    const alignArg = 1 - (((params.pAlign * thetaDeg) % 360) / 180);
    const petalCut = 1 - 0.5 * Math.pow((5 / 4) * Math.pow(alignArg, 2) - 1 / 4, 2);

    phiSeries.push({ x: thetaDeg, y: phi });
    petalCutSeries.push({ x: thetaDeg, y: petalCut });
  }

  for (let i = 0; i < rowSamples; i += 1) {
    const rowT = (i / Math.max(1, rowSamples - 1)) * (ROSE_ROWS * ROSE_RD);
    const hangDown =
      params.curve1 *
      Math.pow(rowT, 2) *
      Math.pow(params.curve2 * rowT - 1, 2) *
      Math.sin(degToRad(phiAtThetaForHang));

    hangDownSeries.push({ x: rowT, y: hangDown });
  }

  return {
    phiSeries,
    petalCutSeries,
    hangDownSeries,
    thetaForHangDeg: thetaForHang * ROSE_TD,
  };
}

export function createRoseFlowerGeometry(params: RoseParams) {
  const cols = ROSE_COLS;
  const rows = ROSE_ROWS;
  const tD = ROSE_TD;
  const rD = ROSE_RD;

  const verticesPerRow = cols + 1;
  const totalVertices = (rows + 1) * verticesPerRow;
  const positions = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);

  let vertexIndex = 0;
  for (let r = 0; r <= rows; r += 1) {
    const rowT = r * rD;
    const rowColor = params.palette
      ? samplePalette(params.palette.stops, rowT)
      : hsbToThreeColor(340, 100, -20 + rowT * 120);
    // Edge-brightness floor on the outermost row only (palette branch only —
    // keep the HSB branch unfloored for v1 identity). Not reversed: rose keeps
    // centre=pos0 / edge=pos1; flooring the rim silhouette lifts it off the
    // near-black scene while inner rows keep the full gradient.
    if (params.palette && r === rows) liftValueFloor(rowColor, EDGE_VALUE_FLOOR);
    const centerBud = THREE.MathUtils.smoothstep(rowT, 0.05, 0.35);

    for (let theta = 0; theta <= cols; theta += 1) {
      const phi = (180 / params.opening) * Math.exp((-theta * tD) / (params.vDensity * 180));
      const alignArg = 1 - (((params.pAlign * theta * tD) % 360) / 180);
      const rawPetalCut = 1 - 0.5 * Math.pow((5 / 4) * Math.pow(alignArg, 2) - 1 / 4, 2);
      const petalCut = THREE.MathUtils.clamp(rawPetalCut, 0.14, 1.15);
      const hangDown =
        params.curve1 *
        Math.pow(rowT, 2) *
        Math.pow(params.curve2 * rowT - 1, 2) *
        Math.sin(degToRad(phi));

      const thetaRad = degToRad(theta * tD);
      const phiRad = degToRad(phi);
      const radialCore = Math.max(0, rowT * Math.sin(phiRad) + hangDown * Math.cos(phiRad));
      const radial = 250 * petalCut * radialCore * centerBud;

      const x = radial * Math.sin(thetaRad);
      const y = -250 * petalCut * centerBud * (rowT * Math.cos(phiRad) - hangDown * Math.sin(phiRad));
      const z = radial * Math.cos(thetaRad);

      positions[vertexIndex * 3] = x;
      positions[vertexIndex * 3 + 1] = y;
      positions[vertexIndex * 3 + 2] = z;

      colors[vertexIndex * 3] = rowColor.r;
      colors[vertexIndex * 3 + 1] = rowColor.g;
      colors[vertexIndex * 3 + 2] = rowColor.b;

      vertexIndex += 1;
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let theta = 0; theta < cols; theta += 1) {
      const a = r * verticesPerRow + theta;
      const b = (r + 1) * verticesPerRow + theta;
      const c = (r + 1) * verticesPerRow + theta + 1;
      const d = r * verticesPerRow + theta + 1;

      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // The append helpers work on plain number[] — convert the typed buffers once.
  // Both the centre dome and the shell append AFTER the base surface, so the
  // row-major front indexing (row*verticesPerRow) that rose.palette.test relies
  // on is preserved.
  const posArr: number[] = Array.from(positions);
  const colArr: number[] = Array.from(colors);

  // Fill the flat bud centre with a small deep dome + stamens (deep inner stop).
  const innerColor = params.palette
    ? samplePalette(params.palette.stops, 1) // deepest stop
    : hsbToThreeColor(340, 90, 30);
  addCenterDome(posArr, colArr, indices, {
    radius: 20,
    height: 15,
    color: innerColor,
    up: "y",
    baseOffset: 0,
    stamens: 7,
  });

  // Petal thickness: append a normal-offset backing shell after the base surface.
  const solid = solidify(posArr, colArr, indices, SHELL_THICKNESS);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(solid.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(solid.colors, 3));
  geometry.setIndex(solid.indices);
  geometry.computeVertexNormals();
  return geometry;
}
