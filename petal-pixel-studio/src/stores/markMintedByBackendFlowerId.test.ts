import { describe, it, expect, beforeEach, vi } from "vitest";

const getUserMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: () => getUserMock(),
  updateGardenFlower: (...args: unknown[]) => updateMock(...args),
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

describe("markMintedByBackendFlowerId", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateMock.mockReset();
    useFlowerStore.setState({ savedFlowers: [seedFlower()] });
  });

  it("returns false when the server update errors, but still applies the optimistic local update", async () => {
    getUserMock.mockResolvedValue("user-1");
    updateMock.mockRejectedValue(new Error("network down"));

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1", "0xdead", "ipfs://uri", { tokenId: 7 });

    expect(ok).toBe(false);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.txHash).toBe("0xdead");
  });

  it("returns true when the server update succeeds", async () => {
    getUserMock.mockResolvedValue("user-1");
    updateMock.mockResolvedValue(undefined);

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1", "0xbeef", undefined);

    expect(ok).toBe(true);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.txHash).toBe("0xbeef");
  });

  it("returns true (no-op sync) when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue(null);

    const ok = await useFlowerStore
      .getState()
      .markMintedByBackendFlowerId("flower-1");

    expect(ok).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    // Optimistic local update still applies even without a signed-in user.
    expect(useFlowerStore.getState().savedFlowers[0].isMinted).toBe(true);
  });
});
