import { describe, it, expect } from "vitest";
import { mintErrorMessage, shouldWarnRegenerate, hasUnsavedWork } from "./createFlowerGuards";

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

  // ── Cluster B1: create-mode regenerate warning (new optional 5th/6th args) ──
  it("create mode: warns once a flower is generated but unsaved", () => {
    expect(shouldWarnRegenerate(false, "rose", "rose", false, "flw-1", [])).toBe(true);
  });

  it("create mode: does NOT warn before anything is generated (no flowerId)", () => {
    expect(shouldWarnRegenerate(false, "rose", "tulip", true, "", [])).toBe(false);
  });

  it("create mode: does NOT warn once the generated flower is saved", () => {
    expect(shouldWarnRegenerate(false, "rose", "rose", false, "flw-1", ["flw-1"])).toBe(false);
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

describe("mintErrorMessage", () => {
  it("tells the user a minted flower cannot be minted again", () => {
    expect(mintErrorMessage("[already_exists] flower is already minted")).toBe(
      "This flower is already minted. Try a different name.",
    );
  });

  it("asks the user to regenerate when the backend lost the flower", () => {
    expect(mintErrorMessage("[not_found] flower not found")).toBe(
      "Flower not found in backend — click Generate again to re-sync it, then try minting.",
    );
  });

  it("recognises the contract's already-minted revert", () => {
    expect(mintErrorMessage('execution reverted: AlreadyMinted()')).toBe(
      "This flower is already minted. Try a different name.",
    );
  });

  it("asks the user to retry when the voucher expired", () => {
    expect(mintErrorMessage('execution reverted: VoucherExpired()')).toBe(
      "This mint offer expired. Click Mint to get a new one.",
    );
  });

  it("passes other errors through unchanged", () => {
    expect(mintErrorMessage("user rejected action")).toBe("user rejected action");
  });
});
