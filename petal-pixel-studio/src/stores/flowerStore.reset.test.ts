import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

const authGetUser = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => authGetUser(...a) },
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

import { useFlowerStore, type SavedFlower } from "@/stores/flowerStore";

const sampleFlower = (id: string): SavedFlower => ({
  id,
  backendFlowerId: id,
  title: "Test Bloom",
  generationWord: "test",
  params: useFlowerStore.getState().params,
  createdAt: "2026-07-02",
  isMinted: false,
});

describe("flowerStore reset + cache hygiene", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("aaa")],
      editingFlowerId: "aaa",
      title: "Someones Flower",
      generationWord: "leftover",
      lastError: "boom",
    });
  });

  it("resetFlowerStore clears savedFlowers and edit state", () => {
    useFlowerStore.getState().resetFlowerStore();
    const s = useFlowerStore.getState();
    expect(s.savedFlowers).toEqual([]);
    expect(s.editingFlowerId).toBeNull();
    expect(s.title).toBe("Untitled Flower");
    expect(s.generationWord).toBe("");
    expect(s.lastError).toBe("");
  });

  it("resetFlowerStore removes the persisted 'petal-pixel-flowers' key", () => {
    localStorage.setItem(
      "petal-pixel-flowers",
      JSON.stringify({ state: { savedFlowers: [sampleFlower("aaa")] }, version: 0 }),
    );
    useFlowerStore.getState().resetFlowerStore();
    expect(localStorage.getItem("petal-pixel-flowers")).toBeNull();
  });

  it("loadFromBackend clears stale savedFlowers when Supabase returns an error", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "db down" } }),
        }),
      }),
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });

  it("loadFromBackend clears stale savedFlowers when the query throws", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockImplementation(() => {
      throw new Error("network");
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });
});
