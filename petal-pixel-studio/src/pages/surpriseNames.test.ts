import { describe, it, expect } from "vitest";
import { SURPRISE_NAMES, pickSurpriseName } from "@/pages/surpriseNames";

describe("SURPRISE_NAMES", () => {
  it("has at least 40 curated entries", () => {
    expect(SURPRISE_NAMES.length).toBeGreaterThanOrEqual(40);
  });

  it("every entry already conforms to the word-input sanitizer (trimmed, single spaces, <= 64 chars)", () => {
    // handleWordInputChange applies value.replace(/\s+/g, ' ').slice(0, 64);
    // the dice path bypasses that handler via setWordInput, so entries must be pre-sanitized.
    for (const name of SURPRISE_NAMES) {
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(/\s{2,}/.test(name)).toBe(false);
      expect(name.includes("\n")).toBe(false);
    }
  });

  it("includes at least one Cyrillic human name", () => {
    expect(SURPRISE_NAMES.some((n) => /[Ѐ-ӿ]/.test(n))).toBe(true);
  });

  it("has no duplicate entries", () => {
    expect(new Set(SURPRISE_NAMES).size).toBe(SURPRISE_NAMES.length);
  });
});

describe("pickSurpriseName", () => {
  it("returns the first entry when rng yields 0", () => {
    expect(pickSurpriseName(() => 0)).toBe(SURPRISE_NAMES[0]);
  });

  it("returns the last entry when rng approaches 1", () => {
    expect(pickSurpriseName(() => 0.999999)).toBe(SURPRISE_NAMES[SURPRISE_NAMES.length - 1]);
  });

  it("always returns a member of the list with the default rng", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(SURPRISE_NAMES).toContain(pickSurpriseName());
    }
  });
});
