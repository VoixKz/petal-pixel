import { describe, it, expect } from "vitest";
import { shouldWarnRegenerate, isCheckingBackend, hasUnsavedWork } from "./createFlowerGuards";
import type { HealthStatus } from "./createFlowerGuards";

describe("shouldWarnRegenerate", () => {
  it("does not warn when not in edit mode (fresh create)", () => {
    // Defect #11 baseline: create mode never warns, even with a changed word.
    expect(shouldWarnRegenerate(false, "rose", "tulip", true)).toBe(false);
  });

  it("warns when the word changed (existing behavior preserved)", () => {
    expect(shouldWarnRegenerate(true, "tulip", "rose", false)).toBe(true);
  });

  it("warns when params are dirty even if the word is unchanged (defect #11 fix)", () => {
    // This is the regression the fix targets: same word, manual slider tweaks
    // must still trigger the warning so they are not silently discarded.
    expect(shouldWarnRegenerate(true, "rose", "rose", true)).toBe(true);
  });

  it("does not warn when word unchanged and params clean", () => {
    expect(shouldWarnRegenerate(true, "rose", "rose", false)).toBe(false);
  });

  it("warns when both word changed and params dirty", () => {
    expect(shouldWarnRegenerate(true, "tulip", "rose", true)).toBe(true);
  });
});

describe("isCheckingBackend", () => {
  const cases: Array<[HealthStatus, boolean]> = [
    ["idle", false],
    ["checking", true],
    ["ok", false],
    ["error", false],
  ];
  it.each(cases)("status %s -> %s", (status, expected) => {
    expect(isCheckingBackend(status)).toBe(expected);
  });
});

describe("hasUnsavedWork (Cluster B1)", () => {
  it("create mode: not dirty when no flower has been generated yet", () => {
    expect(hasUnsavedWork(false, false, false, "", [])).toBe(false);
  });

  it("create mode: dirty when a flower was generated but is not yet saved", () => {
    expect(hasUnsavedWork(false, false, false, "flower-abc", [])).toBe(true);
  });

  it("create mode: NOT dirty once the generated flower id is present in savedFlowers", () => {
    expect(hasUnsavedWork(false, false, false, "flower-abc", ["flower-abc", "other"])).toBe(false);
  });

  it("create mode: accepts a Set of saved ids too", () => {
    expect(hasUnsavedWork(false, false, false, "flower-abc", new Set(["flower-abc"]))).toBe(false);
    expect(hasUnsavedWork(false, false, false, "flower-xyz", new Set(["flower-abc"]))).toBe(true);
  });

  it("edit mode: delegates to paramsDirty/wordChanged, ignoring flowerId/savedIds", () => {
    expect(hasUnsavedWork(true, false, false, "flower-abc", ["flower-abc"])).toBe(false);
    expect(hasUnsavedWork(true, true, false, "flower-abc", ["flower-abc"])).toBe(true);
    expect(hasUnsavedWork(true, false, true, "flower-abc", ["flower-abc"])).toBe(true);
  });
});
