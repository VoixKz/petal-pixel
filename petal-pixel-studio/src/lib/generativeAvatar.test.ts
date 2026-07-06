import { describe, it, expect } from "vitest";
import { generativeAvatarSvg, generativeAvatarDataUri } from "./generativeAvatar";

describe("generativeAvatarSvg", () => {
  it("is deterministic: same seed → identical svg", () => {
    expect(generativeAvatarSvg("Ada Lovelace")).toBe(generativeAvatarSvg("Ada Lovelace"));
  });
  it("differs across seeds", () => {
    expect(generativeAvatarSvg("Ada Lovelace")).not.toBe(generativeAvatarSvg("Grace Hopper"));
  });
  it("returns a well-formed standalone svg with an explicit viewBox", () => {
    const svg = generativeAvatarSvg("seed@example.com");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
  });
  it("honors an explicit size on the outer width/height", () => {
    const svg = generativeAvatarSvg("x", 128);
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
  });
  it("handles empty seed without throwing and stays deterministic", () => {
    expect(() => generativeAvatarSvg("")).not.toThrow();
    expect(generativeAvatarSvg("")).toBe(generativeAvatarSvg(""));
  });
  it("trims/normalizes so equivalent seeds match (whitespace-insensitive)", () => {
    expect(generativeAvatarSvg("  Rose  ")).toBe(generativeAvatarSvg("Rose"));
  });
});

describe("generativeAvatarDataUri", () => {
  it("wraps the svg as a url-encoded data uri and is deterministic", () => {
    expect(generativeAvatarDataUri("Rose")).toBe(generativeAvatarDataUri("Rose"));
    expect(generativeAvatarDataUri("Rose").startsWith("data:image/svg+xml,")).toBe(true);
  });
  it("does not contain raw unencoded angle brackets after the prefix", () => {
    const body = generativeAvatarDataUri("Rose").slice("data:image/svg+xml,".length);
    expect(body).not.toContain("<");
    expect(body).not.toContain(">");
  });
});
