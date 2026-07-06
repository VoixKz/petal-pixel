import { describe, it, expect } from "vitest";
import { truncateMiddle } from "./truncate";

describe("truncateMiddle", () => {
  it("truncates a 66-char tx hash keeping 6 chars each side", () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    expect(truncateMiddle(hash, 6)).toBe("0x1234…abcdef");
  });

  it("truncates a 42-char contract address", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3", 6),
    ).toBe("0x5FbD…180aa3");
  });

  it("defaults keep to 6", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3"),
    ).toBe("0x5FbD…180aa3");
  });

  it("respects a custom keep", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3", 4),
    ).toBe("0x5F…0aa3");
  });

  it("returns short strings unchanged", () => {
    expect(truncateMiddle("0xabc", 6)).toBe("0xabc");
  });

  it("returns a string of exactly keep*2+1 chars unchanged (no pointless ellipsis)", () => {
    expect(truncateMiddle("abcdefghijklm", 6)).toBe("abcdefghijklm"); // 13 chars
  });

  it("truncates once length exceeds keep*2+1", () => {
    expect(truncateMiddle("abcdefghijklmn", 6)).toBe("abcdef…ijklmn"); // 14 chars
  });

  it("returns empty string unchanged", () => {
    expect(truncateMiddle("", 6)).toBe("");
  });

  it("returns the input unchanged for non-positive keep", () => {
    expect(truncateMiddle("0xdeadbeef", 0)).toBe("0xdeadbeef");
    expect(truncateMiddle("0xdeadbeef", -2)).toBe("0xdeadbeef");
  });

  it("uses the single-char ellipsis U+2026, not three dots", () => {
    const out = truncateMiddle("abcdefghijklmnop", 4);
    expect(out).toContain("…");
    expect(out).not.toContain("...");
  });
});
