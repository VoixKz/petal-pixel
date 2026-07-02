import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Flower3D.tsx"), "utf8");

/** Extract the dependency array literal that immediately follows a given memo body marker. */
function depsAfter(marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  // find the "}, [ ... ]);" that closes the useMemo after the marker
  const closeIdx = source.indexOf("}, [", start);
  expect(closeIdx, `no closing deps array after ${marker}`).toBeGreaterThan(-1);
  const arrStart = source.indexOf("[", closeIdx);
  const arrEnd = source.indexOf("]", arrStart);
  return source.slice(arrStart, arrEnd + 1);
}

describe("Flower3D useMemo dependency arrays", () => {
  it("geometry memo depends only on structural family params, never on the whole params or on color/rotation", () => {
    const deps = depsAfter("createClassicFlowerGeometry(params.classicParams)");
    // must key on the exact fields it reads
    expect(deps).toContain("params.flowerType");
    expect(deps).toContain("params.classicParams");
    expect(deps).toContain("params.roseParams");
    expect(deps).toContain("params.bloomParams");
    // must NOT rebuild the ~122k-point geometry on cosmetic changes
    expect(deps).not.toMatch(/\[\s*params\s*\]/); // not the whole params object
    expect(deps).not.toContain("params.colorA");
    expect(deps).not.toContain("params.colorB");
    expect(deps).not.toContain("params.rotation");
    expect(deps).not.toContain("params.material");
    expect(deps).not.toContain("params.glowIntensity");
  });

  it("material memo depends only on color/glow/material fields, never on the whole params or rotation", () => {
    const deps = depsAfter("emissiveIntensity: params.glowIntensity * 0.16");
    expect(deps).toContain("params.flowerType");
    expect(deps).toContain("params.material");
    expect(deps).toContain("params.colorA");
    expect(deps).toContain("params.colorB");
    expect(deps).toContain("params.glowIntensity");
    expect(deps).not.toMatch(/\[\s*params\s*\]/);
    expect(deps).not.toContain("params.rotation");
    expect(deps).not.toContain("params.classicParams");
  });
});
