import * as THREE from "three";
import type { ClassicParams } from "@/math/flowerTypes";
import { bumpiness, vShape } from "@/math/supplement";

export function createClassicFlowerGeometry(params: ClassicParams) {
  const { rows, cols, pNum, fD, pLen, pSharp, fHeight, curve1, curve2, b, bNum } = params;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let theta = 1; theta < rows; theta += 1) {
    for (let phi = 0; phi < cols; phi += 1) {
      const angle = (phi * Math.PI * 2) / cols;
      const r = ((pLen * Math.pow(Math.abs(Math.sin((pNum / 2) * angle)), pSharp) + fD) * theta) / rows;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      const z = vShape(fHeight, r / 100, curve1, curve2, 1.5) - 200 + bumpiness(b, r / 100, bNum, angle);
      positions.push(x, y, z);
    }
  }

  for (let theta = 0; theta < rows - 2; theta += 1) {
    for (let phi = 0; phi < cols; phi += 1) {
      const nextPhi = (phi + 1) % cols;
      const a = theta * cols + phi;
      const bIndex = (theta + 1) * cols + phi;
      const c = (theta + 1) * cols + nextPhi;
      const d = theta * cols + nextPhi;
      indices.push(a, bIndex, c);
      indices.push(a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
