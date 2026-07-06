import { describe, it, expect } from "vitest";
import { paletteGradient, familyLabel } from "@/components/flower/paletteUi";
import type { PaletteStop } from "@/math/palette";

const FOUR_STOPS: PaletteStop[] = [
  { pos: 0, hex: "#ff0000" },
  { pos: 0.33, hex: "#00ff00" },
  { pos: 0.66, hex: "#0000ff" },
  { pos: 1, hex: "#ffffff" },
];

describe("paletteGradient", () => {
  it("builds a left-to-right linear-gradient with whole-percent positions", () => {
    expect(paletteGradient(FOUR_STOPS)).toBe(
      "linear-gradient(90deg, #ff0000 0%, #00ff00 33%, #0000ff 66%, #ffffff 100%)",
    );
  });

  it("rounds fractional positions to the nearest whole percent", () => {
    const stops: PaletteStop[] = [
      { pos: 0, hex: "#111111" },
      { pos: 0.666, hex: "#222222" },
      { pos: 1, hex: "#333333" },
    ];
    expect(paletteGradient(stops)).toBe(
      "linear-gradient(90deg, #111111 0%, #222222 67%, #333333 100%)",
    );
  });

  it("degrades an empty stop list to a flat neutral color (mirrors samplePalette guard)", () => {
    expect(paletteGradient([])).toBe("#808080");
  });

  it("degrades a single-stop palette to that flat color", () => {
    expect(paletteGradient([{ pos: 0, hex: "#abcdef" }])).toBe("#abcdef");
  });

  it("handles two stops (minimum valid palette per proto contract)", () => {
    const stops: PaletteStop[] = [
      { pos: 0, hex: "#000000" },
      { pos: 1, hex: "#ffffff" },
    ];
    expect(paletteGradient(stops)).toBe(
      "linear-gradient(90deg, #000000 0%, #ffffff 100%)",
    );
  });

  it("preserves out-of-order-looking but valid ascending stop positions verbatim (never drops positions)", () => {
    const stops: PaletteStop[] = [
      { pos: 0, hex: "#010101" },
      { pos: 0.1, hex: "#020202" },
      { pos: 0.9, hex: "#030303" },
      { pos: 1, hex: "#040404" },
    ];
    expect(paletteGradient(stops)).toBe(
      "linear-gradient(90deg, #010101 0%, #020202 10%, #030303 90%, #040404 100%)",
    );
  });

  it("treats a null/undefined-like empty array the same as zero stops", () => {
    expect(paletteGradient([] as PaletteStop[])).toBe("#808080");
  });
});

describe("familyLabel", () => {
  // familyLabel returns the RAW canonical key (lowercase) for use in
  // string-equality filters/grouping; display sites apply CSS `capitalize`.
  it("returns the raw v2 family key", () => {
    expect(familyLabel({ family: "sunflower" })).toBe("sunflower");
  });

  it("falls back to flowerType when family is absent (v1 records)", () => {
    expect(familyLabel({ flowerType: "rose" })).toBe("rose");
  });

  it("prefers family over flowerType when both are present", () => {
    expect(familyLabel({ family: "superformula", flowerType: "classic" })).toBe("superformula");
  });

  it("falls back to 'classic' when neither family nor flowerType is present", () => {
    expect(familyLabel({})).toBe("classic");
  });

  it("returns every known v2 family verbatim (no case transform)", () => {
    const families = [
      "classic",
      "rose",
      "zinnia",
      "camellia",
      "lotus",
      "dahlia",
      "sunflower",
      "rhodonea",
      "superformula",
    ] as const;
    for (const family of families) {
      expect(familyLabel({ family })).toBe(family);
    }
  });
});
