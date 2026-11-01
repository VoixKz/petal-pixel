import { describe, it, expect } from "vitest";
import { buildActivityTimeline } from "./activityUtils";
import type { SavedFlower } from "@/stores/flowerStore";

function makeFlower(overrides: {
  id: string;
  createdAt: string;
  title?: string;
  isMinted?: boolean;
  txHash?: string;
  family?: string;
  flowerType?: string;
}): SavedFlower {
  const { id, createdAt, title, isMinted, txHash, family, flowerType } = overrides;
  return {
    id,
    backendFlowerId: id,
    title: title ?? `Flower ${id}`,
    generationWord: "word",
    createdAt,
    isMinted: isMinted ?? false,
    txHash,
    params: {
      flowerType: flowerType ?? "classic",
      ...(family ? { family } : {}),
    } as unknown as SavedFlower["params"],
  };
}

describe("buildActivityTimeline", () => {
  it("returns an empty array for no flowers", () => {
    expect(buildActivityTimeline([])).toEqual([]);
  });

  it("orders days reverse-chronologically", () => {
    const days = buildActivityTimeline([
      makeFlower({ id: "a", createdAt: "2026-07-01" }),
      makeFlower({ id: "b", createdAt: "2026-07-03" }),
      makeFlower({ id: "c", createdAt: "2026-07-02" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-07-03", "2026-07-02", "2026-07-01"]);
  });

  it("groups flowers with the same createdAt into one day, newest-saved first", () => {
    const days = buildActivityTimeline([
      makeFlower({ id: "first-saved", createdAt: "2026-07-04" }),
      makeFlower({ id: "second-saved", createdAt: "2026-07-04" }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].events.map((e) => e.flowerId)).toEqual(["second-saved", "first-saved"]);
    expect(days[0].events.every((e) => e.kind === "created")).toBe(true);
  });

  it("emits a minted event before the created event for minted flowers, carrying txHash", () => {
    const days = buildActivityTimeline([
      makeFlower({ id: "m1", createdAt: "2026-07-05", isMinted: true, txHash: "0xabc123def4567890" }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].events.map((e) => e.kind)).toEqual(["minted", "created"]);
    const minted = days[0].events[0];
    expect(minted.kind).toBe("minted");
    if (minted.kind === "minted") {
      expect(minted.txHash).toBe("0xabc123def4567890");
      expect(minted.title).toBe("Flower m1");
    }
  });

  it("carries family + flowerType on created events (v2) and degrades to flowerType-only for v1", () => {
    const days = buildActivityTimeline([
      makeFlower({ id: "v1", createdAt: "2026-07-01", flowerType: "rose" }),
      makeFlower({ id: "v2", createdAt: "2026-07-02", family: "sunflower", flowerType: "classic" }),
    ]);
    const v2Created = days[0].events[0];
    const v1Created = days[1].events[0];
    expect(v2Created.kind).toBe("created");
    if (v2Created.kind === "created") {
      expect(v2Created.family).toBe("sunflower");
    }
    if (v1Created.kind === "created") {
      expect(v1Created.family).toBeUndefined();
      expect(v1Created.flowerType).toBe("rose");
    }
  });

  it("skips flowers with an empty createdAt", () => {
    const days = buildActivityTimeline([makeFlower({ id: "x", createdAt: "" })]);
    expect(days).toEqual([]);
  });
});
