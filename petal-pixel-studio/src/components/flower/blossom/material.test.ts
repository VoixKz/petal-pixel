import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildBlossom, PART_KIND } from "@/math/blossom/build";
import { SPECIES } from "@/math/blossom/species";
import { poseOf } from "./crossing";
import { heartColour, partsGeometry } from "./material";

const camellia = buildBlossom("Anna", SPECIES[0]);
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fromAxis = ([x, , z]: number[]) => Math.hypot(x, z);

describe("the two faces of a petal", () => {
  const petal = camellia.petals[0];
  const pose = poseOf(petal, camellia, 1);

  it("stand apart in the middle, with the inner one nearer the axis", () => {
    const inner = pose({ x: 0, y: 0.5, z: 1 });
    const outer = pose({ x: 0, y: 0.5, z: -1 });
    expect(distance(inner, outer)).toBeGreaterThan(0.005);
    expect(fromAxis(inner)).toBeLessThan(fromAxis(outer));
  });

  it("are further apart at the base than near the tip", () => {
    const gapAt = (y: number) => distance(pose({ x: 0, y, z: 1 }), pose({ x: 0, y, z: -1 }));
    expect(gapAt(0.3)).toBeGreaterThan(gapAt(0.9));
  });

  it("meet at the rim and the tip, so a petal is closed", () => {
    expect(distance(pose({ x: 1, y: 0.5, z: 1 }), pose({ x: 1, y: 0.5, z: -1 }))).toBeLessThan(1e-6);
    expect(distance(pose({ x: 0, y: 1, z: 1 }), pose({ x: 0, y: 1, z: -1 }))).toBeLessThan(1e-6);
  });

  it("do not make a stamen any thicker than a thread", () => {
    const lotus = buildBlossom("Anna", SPECIES.find((species) => species.id === "lotus"));
    const stamen = lotus.head.find((part) => part.kind === PART_KIND.stamen);
    if (!stamen) throw new Error("a lotus has stamens");
    const thread = poseOf(stamen, lotus, 1);
    expect(distance(thread({ x: 0, y: 0.5, z: 1 }), thread({ x: 0, y: 0.5, z: -1 }))).toBe(0);
  });
});

describe("the grid of a flower", () => {
  const parts = camellia.petals;
  const single = partsGeometry(parts, false);
  const solid = partsGeometry(parts, true);

  it("draws one surface when the device can't afford two", () => {
    const zs = Array.from({ length: single.getAttribute("position").count }, (_, i) => single.getAttribute("position").getZ(i));
    expect(new Set(zs)).toEqual(new Set([0]));
  });

  it("draws a second surface that faces the other way", () => {
    const count = single.getAttribute("position").count;
    const index = solid.index as THREE.BufferAttribute;
    expect(solid.getAttribute("position").count).toBe(count * 2);
    expect(index.count).toBe((single.index as THREE.BufferAttribute).count * 2);
    const half = index.count / 2;
    expect([index.getX(half), index.getX(half + 1), index.getX(half + 2)]).toEqual(
      [index.getX(half - 1), index.getX(half - 2), index.getX(half - 3)].map((corner) => corner + count),
    );
  });

  it("gathers its columns at the rim, where the surface turns fastest", () => {
    const row = Array.from({ length: 19 }, (_, i) => single.getAttribute("position").getX(i));
    expect(row[18] - row[17]).toBeLessThan(row[10] - row[9]);
  });
});

describe("the heart of a flower", () => {
  const everyColour = SPECIES.flatMap((species) => species.palettes);

  it("is its petals' own colour sunk into shade, so no green shows there", () => {
    for (const colour of everyColour) {
      const heart = heartColour(colour);
      const base = new THREE.Color(colour[0]);
      const middle = new THREE.Color(colour[1]);
      for (const channel of ["r", "g", "b"] as const) expect(heart[channel]).toBeLessThanOrEqual(Math.max(base[channel], middle[channel]));
      if (base.g < Math.max(base.r, base.b)) expect(heart.g).toBeLessThan(Math.max(heart.r, heart.b));
    }
  });
});
