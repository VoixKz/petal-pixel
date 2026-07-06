import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the Supabase client BEFORE importing the store ──────────────────────
// upsertResult is mutated per-test to simulate success vs. error.
const upsertResult: { error: { message: string } | null } = { error: null };
const upsertMock = vi.fn(async () => upsertResult);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-123" } } })),
    },
    from: vi.fn(() => ({
      // create path -> supabaseUpsertFlower -> .from('user_flowers').upsert(...)
      upsert: upsertMock,
      // edit path helpers (unused here, present so chaining never throws)
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    })),
  },
}));

// Store imports this at module load; stub so the real gRPC client isn't pulled in.
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore } from "./flowerStore";

describe("saveFlower Supabase error propagation (create path)", () => {
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

  it("rejects when the Supabase upsert returns an error", async () => {
    upsertResult.error = { message: "duplicate key value" };

    await expect(useFlowerStore.getState().saveFlower()).rejects.toThrow(
      "duplicate key value",
    );

    // Optimistic local set must still have happened despite the failed write.
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().savedFlowers[0].id).toBe("flower-abc");
  });

  it("resolves 'created' when the Supabase upsert succeeds for a new flower", async () => {
    // Changed by Cluster A: saveFlower now returns 'created' | 'updated' | 'aborted'
    // so CreateFlower can pick the right toast message instead of always
    // assuming a create-path save added a brand-new flower.
    upsertResult.error = null;

    await expect(useFlowerStore.getState().saveFlower()).resolves.toBe("created");

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
  });
});
