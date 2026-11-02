import { describe, expect, it } from "vitest";
import { buildBlossom } from "./build";
import { LIFE, lifeAtGrowth, stemGrowth } from "./life";
import { SPECIES } from "./species";
import { bladesOf, emptyPath, emptyTube, placeAt, radiusAt, STEM_SEGMENTS, traceStem, writeLeaves, writeTube } from "./stem";

const pathAt = (life: number, seed = "Anna", time = 0) => {
  const blossom = buildBlossom(seed, SPECIES[0]);
  const path = emptyPath();
  traceStem(blossom.stem, life, time, path);
  return { blossom, path, tip: placeAt(path, path.length) };
};

describe("the stem", () => {
  it("grows from a fixed base, not by stretching", () => {
    const early = pathAt(0.2);
    const late = pathAt(0.44);
    expect(late.path.length).toBeGreaterThan(early.path.length);
    expect(late.path.points[1]).toBeCloseTo(early.path.points[1], 5);
  });

  it("comes out of the soil bent over, then straightens", () => {
    const shoot = pathAt(0.09);
    const grown = pathAt(0.44);
    expect(shoot.tip.ty).toBeLessThan(0.3);
    expect(grown.tip.ty).toBeGreaterThan(0.5);
  });

  it("stands about as tall as planned when it is grown", () => {
    const { blossom, tip } = pathAt(1);
    expect(tip.y).toBeGreaterThan(blossom.stem.height * 0.85);
    expect(tip.y).toBeLessThan(blossom.stem.height * 1.01);
  });

  it("bends its neck further as the flower opens", () => {
    expect(pathAt(1).tip.tz).toBeGreaterThan(pathAt(LIFE.petals[0]).tip.tz + 0.1);
  });

  it("keeps a frame at right angles along its whole length", () => {
    const { path } = pathAt(0.3);
    for (let k = 0; k <= STEM_SEGMENTS; k += 1) {
      const a = [0, 1, 2].map((c) => path.tangents[k * 3 + c]);
      const b = [0, 1, 2].map((c) => path.normals[k * 3 + c]);
      expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(0, 4);
    }
  });

  it("is thicker at the base than near the flower", () => {
    const { blossom, path } = pathAt(1);
    expect(radiusAt(blossom.stem, path, 0.01)).toBeGreaterThan(radiusAt(blossom.stem, path, path.length - 0.3));
  });

  it("writes a skin with no broken numbers at any age", () => {
    for (const life of [0, 0.03, 0.1, 0.3, 0.5, 1]) {
      const { blossom, path } = pathAt(life);
      const tube = emptyTube();
      writeTube(blossom.stem, path, tube);
      expect(tube.positions.every(Number.isFinite)).toBe(true);
      expect(tube.normals.every(Number.isFinite)).toBe(true);
    }
  });

  it("moves in the air only when given time", () => {
    expect(pathAt(1, "Anna", 0).tip.x).toEqual(pathAt(1, "Anna", 0).tip.x);
    expect(pathAt(1, "Anna", 3).tip.x).not.toEqual(pathAt(1, "Anna", 0).tip.x);
  });
});

describe("leaves", () => {
  it("start when the tip of the stem has passed their joint", () => {
    for (const species of SPECIES) {
      for (const leaf of buildBlossom("Anna", species).leaves) {
        expect(stemGrowth(leaf.birth)).toBeGreaterThanOrEqual(Math.min(leaf.node, 0.06));
      }
    }
  });

  it("finds the moment the stem reaches a height", () => {
    expect(stemGrowth(lifeAtGrowth(0.5))).toBeCloseTo(0.5, 4);
  });

  it("are hidden until then, and sit on the stem afterwards", () => {
    const { blossom, path } = pathAt(1);
    const blades = bladesOf(blossom.leaves);
    const matrices = new Float32Array(blades.length * 16);
    const ages = new Float32Array(blades.length);

    writeLeaves(blossom.stem, path, 0, blades, matrices, ages);
    expect(matrices.every((value) => value === 0)).toBe(true);

    writeLeaves(blossom.stem, path, 1, blades, matrices, ages);
    blades.forEach(({ leaf, leaflet }, index) => {
      if (leaflet) return;
      const joint = placeAt(path, leaf.node * blossom.stem.height);
      const at = index * 16 + 12;
      const away = Math.hypot(matrices[at] - joint.x, matrices[at + 1] - joint.y, matrices[at + 2] - joint.z);
      expect(away).toBeLessThan(blossom.stem.radius * 1.5);
    });
    expect(ages[0]).toBe(1);
  });

  it("gives each species its own foliage", () => {
    const leafCount = (id: string) => {
      const species = SPECIES.find((s) => s.id === id)!;
      return bladesOf(buildBlossom("Anna", species).leaves).length;
    };
    expect(leafCount("rose")).toBeGreaterThan(leafCount("tiger-lily") * 4);
    expect(buildBlossom("Anna", SPECIES.find((s) => s.id === "rose")!).thorns.length).toBeGreaterThan(0);
    expect(buildBlossom("Anna", SPECIES.find((s) => s.id === "tiger-lily")!).thorns).toHaveLength(0);
  });
});
