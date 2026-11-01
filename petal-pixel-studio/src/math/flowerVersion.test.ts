import { describe, it, expect } from "vitest";
import { isV2 } from "@/math/flowerVersion";

describe("isV2", () => {
  it("is true only when algoVersion is 'v2' AND family is set", () => {
    expect(isV2({ algoVersion: "v2", family: "sunflower" })).toBe(true);
    expect(isV2({ algoVersion: "v2", family: "classic" })).toBe(true);
  });

  it("is false for a v1 record (no family)", () => {
    expect(isV2({ algoVersion: "v1", family: undefined })).toBe(false);
  });

  it("is false when algoVersion is v2 but family is missing (conjunctive guard)", () => {
    expect(isV2({ algoVersion: "v2", family: undefined })).toBe(false);
  });

  it("is false when family is set but algoVersion is not v2", () => {
    expect(isV2({ algoVersion: "v1", family: "rose" })).toBe(false);
  });

  it("is false for an empty-string or null family (malformed backend response)", () => {
    expect(isV2({ algoVersion: "v2", family: "" })).toBe(false);
    expect(isV2({ algoVersion: "v2", family: null })).toBe(false);
  });
});
