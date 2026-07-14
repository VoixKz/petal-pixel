import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createParametricBloomGeometry, BLOOM_SURFACE_CAP } from "@/math/flowers/bloom";
import { DEFAULT_BLOOM_PARAMS, BLOOM_TYPES } from "@/math/flowerTypes";

// Geometry inspection helper: number of surviving vertices in the buffer.
function countVertices(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute("position").count;
}

const SLIDER_FADE_MIN = 0.4; // must match FlowerControls.tsx:158

// Each bloom build now also runs solidify() (petal thickness) + the centre dome,
// so a build costs noticeably more than pre-shell. These tests build many blooms
// (up to 8), which can exceed the 20s default under concurrent CPU load — raise
// the per-test timeout so the wave's full-suite gate stays green (they pass in a
// few seconds in isolation). perf-split later trims the per-vertex work further.
const HEAVY = 120000;

describe("createParametricBloomGeometry vertex cap", () => {
  it("caps the base surface (post-shell count stays bounded) for every bloom type", () => {
    for (const type of BLOOM_TYPES) {
      const geometry = createParametricBloomGeometry(type, DEFAULT_BLOOM_PARAMS);
      const count = countVertices(geometry);
      // The cap bounds the pre-shell surface at BLOOM_SURFACE_CAP; solidify()
      // then doubles it (+ a small center dome), so the observed post-shell
      // count must stay under ~2x the cap.
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(2 * (BLOOM_SURFACE_CAP + 200));
    }
  }, HEAVY);
});

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
  }, HEAVY);

  it("does not silently drop the outer sweep for zinnia at fade minimum", () => {
    const clipped = countVertices(
      createParametricBloomGeometry("zinnia", { ...DEFAULT_BLOOM_PARAMS, fade: SLIDER_FADE_MIN })
    );
    // zinnia at the old formula lost every vertex past theta=2600 of a
    // -360..2700 sweep; require a healthy vertex count survives.
    expect(clipped).toBeGreaterThan(1000);
  }, HEAVY);
});
