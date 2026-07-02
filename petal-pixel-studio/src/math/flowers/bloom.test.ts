import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createParametricBloomGeometry } from "@/math/flowers/bloom";
import { DEFAULT_BLOOM_PARAMS, BLOOM_TYPES } from "@/math/flowerTypes";

// Geometry inspection helper: number of surviving vertices in the buffer.
function countVertices(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute("position").count;
}

const SLIDER_FADE_MIN = 0.4; // must match FlowerControls.tsx:158

describe("createParametricBloomGeometry Spiral Fade range", () => {
  it("keeps a meaningful fraction of the bloom at the fade slider minimum", () => {
    for (const type of BLOOM_TYPES) {
      const full = countVertices(
        createParametricBloomGeometry(type, { ...DEFAULT_BLOOM_PARAMS, fade: 1 })
      );
      const clipped = countVertices(
        createParametricBloomGeometry(type, { ...DEFAULT_BLOOM_PARAMS, fade: SLIDER_FADE_MIN })
      );
      // At the slider minimum the old code deleted the far half of the sweep
      // for zinnia/camellia. Require the low end retain most of the geometry.
      expect(clipped / full).toBeGreaterThan(0.8);
    }
  });

  it("does not silently drop the outer sweep for zinnia at fade minimum", () => {
    const clipped = countVertices(
      createParametricBloomGeometry("zinnia", { ...DEFAULT_BLOOM_PARAMS, fade: SLIDER_FADE_MIN })
    );
    // zinnia at the old formula lost every vertex past theta=2600 of a
    // -360..2700 sweep; require a healthy vertex count survives.
    expect(clipped).toBeGreaterThan(1000);
  });
});
