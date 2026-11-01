import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the garden API BEFORE importing the store ──────────────────────
// upsertResult is mutated per-test to simulate success vs. error.
const upsertResult: { error: { message: string } | null } = { error: null };
const upsertMock = vi.fn(async (..._args: unknown[]) => {
  if (upsertResult.error) throw new Error(upsertResult.error.message);
});

vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => "user-123"),
  upsertGardenFlower: (...args: unknown[]) => upsertMock(...args),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: vi.fn(async () => undefined),
  listGarden: vi.fn(async () => []),
}));

// Store imports this at module load; stub so the real gRPC client isn't pulled in.
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore } from "./flowerStore";

describe("saveFlower server error propagation (create path)", () => {
  beforeEach(() => {
    upsertResult.error = null;
    upsertMock.mockClear();
    // Reset store to a clean create-path state: a backend flowerId, no edit mode.
    useFlowerStore.setState({
      editingFlowerId: null,
      savedFlowers: [],
      title: "Test Flower",
      generationWord: "sunrise",
      params: { ...useFlowerStore.getState().params, flowerId: "flower-abc" },
    });
  });

  it("rejects when the server upsert returns an error", async () => {
    upsertResult.error = { message: "duplicate key value" };

    await expect(useFlowerStore.getState().saveFlower()).rejects.toThrow(
      "duplicate key value",
    );

    // Optimistic local set must still have happened despite the failed write.
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().savedFlowers[0].id).toBe("flower-abc");
  });

  it("resolves 'created' when the server upsert succeeds for a new flower", async () => {
    // Changed by Cluster A: saveFlower now returns 'created' | 'updated' | 'aborted'
    // so CreateFlower can pick the right toast message instead of always
    // assuming a create-path save added a brand-new flower.
    upsertResult.error = null;

    await expect(useFlowerStore.getState().saveFlower()).resolves.toBe("created");

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
  });
});
