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
      ownerUserId: null,
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

  it("resetFlowerStore also clears ownerUserId", () => {
    useFlowerStore.setState({ ownerUserId: "user-a" });
    useFlowerStore.getState().resetFlowerStore();
    expect(useFlowerStore.getState().ownerUserId).toBeNull();
  });

  it("resetFlowerStore removes the persisted 'petal-pixel-flowers' key", () => {
    localStorage.setItem(
      "petal-pixel-flowers",
      JSON.stringify({ state: { savedFlowers: [sampleFlower("aaa")], ownerUserId: "user-a" }, version: 0 }),
    );
    useFlowerStore.getState().resetFlowerStore();
    expect(localStorage.getItem("petal-pixel-flowers")).toBeNull();
  });

  it("loadFromBackend sets ownerUserId to the authenticated user", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().ownerUserId).toBe("u1");
  });

  it("loadFromBackend sets ownerUserId even when rows are returned", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [{
              flower_id: "f1",
              saved_name: "Bloom",
              generation_word: "rose",
              params: { ...useFlowerStore.getState().params },
              created_at: "2026-01-01T00:00:00Z",
              is_minted: false,
              tx_hash: null,
              token_uri: null,
            }],
            error: null,
          }),
        }),
      }),
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().ownerUserId).toBe("u2");
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
  });

  // Cross-user rehydration guard (Finding 2+3):
  // Simulates the AuthContext logic so we can test the store behaviour in isolation.
  it("cross-user guard: resets store when ownerUserId differs from new user id", () => {
    // Arrange: store is seeded with User A's data
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("flower-a")],
      ownerUserId: "user-a",
    });

    // Act: simulate what AuthContext.onAuthStateChange does for a new user login
    const incomingUserId = "user-b";
    const { ownerUserId } = useFlowerStore.getState();
    if (ownerUserId && ownerUserId !== incomingUserId) {
      useFlowerStore.getState().resetFlowerStore();
    }

    // Assert: User A's flowers are gone
    const s = useFlowerStore.getState();
    expect(s.savedFlowers).toEqual([]);
    expect(s.ownerUserId).toBeNull();
  });

  it("cross-user guard: does NOT reset when ownerUserId matches the new user id", () => {
    // Arrange: store is seeded with User A's data
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("flower-a")],
      ownerUserId: "user-a",
    });

    // Act: same user logs in again (e.g. page refresh, re-auth)
    const incomingUserId = "user-a";
    const { ownerUserId } = useFlowerStore.getState();
    if (ownerUserId && ownerUserId !== incomingUserId) {
      useFlowerStore.getState().resetFlowerStore();
    }

    // Assert: User A's flowers are preserved
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().ownerUserId).toBe("user-a");
  });

  it("cross-user guard: does NOT reset when ownerUserId is null (fresh install)", () => {
    // Arrange: no prior owner
    useFlowerStore.setState({
      savedFlowers: [],
      ownerUserId: null,
    });

    const incomingUserId = "user-b";
    const { ownerUserId } = useFlowerStore.getState();
    if (ownerUserId && ownerUserId !== incomingUserId) {
      useFlowerStore.getState().resetFlowerStore();
    }

    // Guard should not have fired — ownerUserId was null
    expect(useFlowerStore.getState().ownerUserId).toBeNull();
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
