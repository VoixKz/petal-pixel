import { describe, it, expect } from "vitest";
import { typeScale, monoMeta, chip, focusRing } from "@/lib/designTokens";

describe("designTokens", () => {
  it("exposes the four type-scale classes with stable names", () => {
    expect(typeScale).toEqual({
      pageTitle: "type-page-title",
      sectionTitle: "type-section-title",
      body: "type-body",
      meta: "type-meta",
    });
  });
  it("exposes the mono-meta class for generative metadata", () => {
    expect(monoMeta).toBe("mono-meta");
  });
  it("exposes chip base + three tone variants", () => {
    expect(chip).toEqual({
      base: "chip",
      primary: "chip-primary",
      accent: "chip-accent",
      muted: "chip-muted",
    });
  });
  it("focusRing uses ring-2 ring-primary with an offset (binding a11y contract)", () => {
    expect(focusRing).toContain("focus-visible:ring-2");
    expect(focusRing).toContain("focus-visible:ring-primary");
    expect(focusRing).toContain("focus-visible:ring-offset-2");
  });
  it("never floors interactive text below 12px (no text-[10px])", () => {
    const all = [...Object.values(typeScale), monoMeta, ...Object.values(chip), focusRing];
    expect(all.join(" ")).not.toMatch(/text-\[10px\]/);
  });
});
