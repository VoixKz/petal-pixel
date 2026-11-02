import { describe, expect, it } from "vitest";
import { buildBlossom } from "./build";
import { identityOf, kindOf, tintOf } from "./identity";
import { seedOf } from "./name";

describe("a flower's identity", () => {
  it("is what the name really grows", () => {
    for (const name of ["Dana", "Maya", "Айгерим", "Anna #2"]) {
      const flower = buildBlossom(seedOf(name));
      const identity = identityOf(name);
      expect(identity.species.id).toBe(flower.species.id);
      expect(identity.colour).toEqual(flower.colour);
    }
  });

  it("reads the same however the name is typed", () => {
    expect(identityOf("  DANA ")).toBe(identityOf("dana"));
  });

  it("says what kind of flower it is", () => {
    expect(kindOf("Dana")).toBe("rose");
  });

  it("gives a usable colour strip", () => {
    expect(tintOf("Dana")).toMatch(/^linear-gradient\(90deg, #[0-9a-f]{6}, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  });
});
