import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { computeFlowerBounds, GROUP_POSITION_Y, GROUP_SCALE, GROUP_TILT_X } from "@/math/flowerBounds";
import { createClassicFlowerGeometry, createParametricBloomGeometry } from "@/math/flowerGeometry";
import { DEFAULT_BLOOM_PARAMS, DEFAULT_CLASSIC_PARAMS } from "@/math/flowerTypes";

/** Actual world-space bbox for a given idle yaw, replicating the Flower3D scene graph. */
function actualWorldBox(geometry: THREE.BufferGeometry, blossomRotation: [number, number, number], yaw: number) {
  const group = new THREE.Group();
  group.rotation.set(GROUP_TILT_X, yaw, 0);
  group.scale.setScalar(GROUP_SCALE);
  group.position.set(0, GROUP_POSITION_Y, 0);
  const mesh = new THREE.Mesh(geometry);
  mesh.rotation.set(...blossomRotation);
  group.add(mesh);
  group.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(group);
}

const YAWS = [0, 0.6, 1.3, 2.1, 2.9, 3.7, 4.4, 5.2, 6.0];

describe("computeFlowerBounds", () => {
  const cases: Array<{ label: string; geo: THREE.BufferGeometry; rot: [number, number, number] }> = [
    { label: "classic", geo: createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS), rot: [-Math.PI / 2, 0, 0] },
    { label: "dahlia bloom", geo: createParametricBloomGeometry("dahlia", DEFAULT_BLOOM_PARAMS), rot: [Math.PI, 0, 0] },
  ];

  for (const { label, geo, rot } of cases) {
    it(`${label}: groundY is a conservative lower bound for every idle yaw`, () => {
      const b = computeFlowerBounds(geo, rot);
      expect(b).not.toBeNull();
      for (const yaw of YAWS) {
        const box = actualWorldBox(geo, rot, yaw);
        // Never above the real bottom (shadow plane must not slice the flower)…
        expect(b!.groundY).toBeLessThanOrEqual(box.min.y + 1e-6);
        // …and the top estimate covers the real top (so ContactShadows `far` reaches it).
        expect(b!.topY).toBeGreaterThanOrEqual(box.max.y - 1e-6);
      }
    });

    it(`${label}: groundY is reasonably tight (not absurdly far below the flower)`, () => {
      const b = computeFlowerBounds(geo, rot);
      const worstMinY = Math.min(...YAWS.map((yaw) => actualWorldBox(geo, rot, yaw).min.y));
      // Conservative slack from the cylinder bound + margin stays bounded.
      expect(worstMinY - b!.groundY).toBeLessThan(0.4);
    });

    it(`${label}: horizontal extent covers the real footprint for every yaw`, () => {
      const b = computeFlowerBounds(geo, rot);
      for (const yaw of YAWS) {
        const box = actualWorldBox(geo, rot, yaw);
        const footprint = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
        expect(b!.maxXZRadius).toBeGreaterThanOrEqual(footprint - 1e-6);
      }
    });
  }

  it("keeps the legacy camera-framing fields (center/size/radius) identical to the old inline math", () => {
    const geo = createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS);
    const rot: [number, number, number] = [-Math.PI / 2, 0, 0];
    const b = computeFlowerBounds(geo, rot)!;

    // Old inline math from Flower3D.tsx (blossom rotation only, no tilt).
    geo.computeBoundingBox();
    const transformed = geo.boundingBox!.clone();
    transformed.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    transformed.min.multiplyScalar(GROUP_SCALE).add(new THREE.Vector3(0, GROUP_POSITION_Y, 0));
    transformed.max.multiplyScalar(GROUP_SCALE).add(new THREE.Vector3(0, GROUP_POSITION_Y, 0));
    const size = transformed.getSize(new THREE.Vector3());
    const center = transformed.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.35);

    expect(b.center.distanceTo(center)).toBeLessThan(1e-9);
    expect(b.size.distanceTo(size)).toBeLessThan(1e-9);
    expect(b.radius).toBeCloseTo(radius, 9);
  });
});
