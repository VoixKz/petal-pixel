import { describe, it, expect, beforeEach, vi } from "vitest";

const getUserMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    from: () => ({
      update: (...args: unknown[]) => updateMock(...args),
    }),
  },
}));

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore, type SavedFlower } from "@/stores/flowerStore";

const baseParams = { ...useFlowerStore.getState().params };

function seedFlower(overrides: Partial<SavedFlower> = {}): SavedFlower {
  return {
    id: "flower-1",
    backendFlowerId: "flower-1",
    title: "Test",
    generationWord: "test",
    params: { ...baseParams, flowerId: "flower-1" },
    createdAt: "2026-07-02",
    isMinted: false,
    ...overrides,
  };
}

// .eq().eq() chain resolving to a Supabase-style { error } object
function chainResolving(error: unknown) {
  const eq2 = vi.fn().mockResolvedValue({ error });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  return { eq: eq1 };
}

describe("markMintedByBackendFlowerId", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateMock.mockReset();
    useFlowerStore.setState({ savedFlowers: [seedFlower()] });
  });

  it("returns false when the Supabase update errors, but still applies the optimistic local update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving({ message: "network down" }));

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1", "0xdead", "ipfs://uri");

    expect(ok).toBe(false);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.txHash).toBe("0xdead");
  });

  it("returns true when the Supabase update succeeds", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1", "0xbeef", undefined);

    expect(ok).toBe(true);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.txHash).toBe("0xbeef");
  });

  it("returns true (no-op sync) when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1");

    expect(ok).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    // Optimistic local update still applies even without a signed-in user.
    expect(useFlowerStore.getState().savedFlowers[0].isMinted).toBe(true);
  });
});
