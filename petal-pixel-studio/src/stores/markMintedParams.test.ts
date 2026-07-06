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
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function seedFlower(overrides: Partial<SavedFlower> = {}): SavedFlower {
  return {
    id: "flower-1",
    backendFlowerId: "flower-1",
    title: "Test",
    generationWord: "test",
    params: { ...baseParams, flowerId: "flower-1" },
    createdAt: "2026-07-06",
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

describe("markMintedByBackendFlowerId mint-result params", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateMock.mockReset();
    useFlowerStore.setState({ savedFlowers: [seedFlower()] });
  });

  it("writes mintTokenId + mintContractAddress into the saved flower's params", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    const ok = await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1",
      "0xhash",
      "http://uri/metadata.json",
      { tokenId: 7, contractAddress: CONTRACT },
    );

    expect(ok).toBe(true);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.params.mintTokenId).toBe(7);
    expect(flower.params.mintContractAddress).toBe(CONTRACT);
  });

  it("persists the updated params through the Supabase update payload", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1", "0xhash", undefined, { tokenId: 7, contractAddress: CONTRACT },
    );

    const payload = updateMock.mock.calls[0][0] as {
      params?: { mintTokenId?: number; mintContractAddress?: string };
    };
    expect(payload.params?.mintTokenId).toBe(7);
    expect(payload.params?.mintContractAddress).toBe(CONTRACT);
  });

  it("tolerates a missing tokenId (contract address alone still persisted)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1", "0xhash", undefined, { contractAddress: CONTRACT },
    );

    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.params.mintTokenId).toBeUndefined();
    expect(flower.params.mintContractAddress).toBe(CONTRACT);
  });

  it("omits the params column and leaves params untouched when no mint info is passed", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId("flower-1", "0xhash");

    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect("params" in payload).toBe(false);
    expect(useFlowerStore.getState().savedFlowers[0].params.mintTokenId).toBeUndefined();
  });
});
