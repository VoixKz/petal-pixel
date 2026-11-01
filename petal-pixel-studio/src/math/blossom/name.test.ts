import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanName, seedOf } from "./name";

describe("a name", () => {
  it("ignores capitals and extra spaces", () => {
    expect(cleanName("  Anna   Maria ")).toBe("anna maria");
  });

  it("becomes the SHA-256 the page shows", () => {
    expect(seedOf(" DANA ")).toBe("2c9e0a2585dc7406589a3724f0027811506e0f133726303a15d6779d532a2573");
  });

  it("gives every spelling of a name the same seed", () => {
    expect(seedOf("anna maria")).toBe(seedOf("  Anna  MARIA"));
  });

  it.each(["a", "Айгерим", "نور", "🌸 emoji name", "x".repeat(55), "y".repeat(56), "z".repeat(64), "w".repeat(200)])(
    "hashes %s exactly as SHA-256 does",
    (name) => {
      expect(seedOf(name)).toBe(createHash("sha256").update(cleanName(name)).digest("hex"));
    },
  );
});
