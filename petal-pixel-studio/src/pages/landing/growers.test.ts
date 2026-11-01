import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GROWERS, STAGES, stageAt } from "./growers";

const inPublic = (path: string) => existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "")));

describe("growers", () => {
  it("has a picture for every flower", () => {
    for (const grower of GROWERS) expect(inPublic(`/flowers/grow/${grower.id}.webp`)).toBe(true);
  });

  it("only offers scans whose file ships with the site", () => {
    for (const grower of GROWERS) if (grower.scan) expect(inPublic(grower.scan.url)).toBe(true);
  });

  it("credits every scan on the page", () => {
    for (const grower of GROWERS) if (grower.scan) expect(grower.note).toMatch(/Smithsonian/);
  });
});

describe("stageAt", () => {
  it("names the stage a plant has reached", () => {
    expect(stageAt(0)).toBe("Soil");
    expect(stageAt(0.3)).toBe("Stem");
    expect(stageAt(0.5)).toBe("Bud");
    expect(stageAt(1)).toBe("Bloom");
  });

  it("lists stages in growing order", () => {
    const ats = STAGES.map((stage) => stage.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
  });
});
