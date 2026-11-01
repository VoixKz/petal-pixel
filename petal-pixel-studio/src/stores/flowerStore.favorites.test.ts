import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the garden API BEFORE importing the store (matches flowerStore.v2.test.ts) ──
vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => "user-123"),
  listGarden: vi.fn(async () => []),
  upsertGardenFlower: vi.fn(async () => undefined),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: vi.fn(async () => undefined),
}));

// gRPC client is mocked but unused here — toggleFavorite never generates.
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore } from "./flowerStore";

describe("toggleFavorite", () => {
  beforeEach(() => {
    const base = useFlowerStore.getState().params;
    useFlowerStore.setState({
      savedFlowers: [
        {
          id: "f1",
          backendFlowerId: "f1",
          title: "t",
          generationWord: "w",
          params: { ...base, flowerId: "f1" },
          createdAt: "2026-07-14",
          isMinted: false,
        },
      ],
    });
  });

  it("flips isFavorite on the flower and mirrors into params jsonb", async () => {
    await useFlowerStore.getState().toggleFavorite("f1");
    let f = useFlowerStore.getState().savedFlowers[0];
    expect(f.isFavorite).toBe(true);
    expect(f.params.isFavorite).toBe(true);

    await useFlowerStore.getState().toggleFavorite("f1");
    f = useFlowerStore.getState().savedFlowers[0];
    expect(f.isFavorite).toBe(false);
    expect(f.params.isFavorite).toBe(false);
  });

  it("is a no-op for an unknown id", async () => {
    await useFlowerStore.getState().toggleFavorite("nope");
    expect(useFlowerStore.getState().savedFlowers[0].isFavorite).toBeFalsy();
  });
});
