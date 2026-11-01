import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.hoisted(() => ({
  listGarden: vi.fn(),
  upsertGardenFlower: vi.fn(async (..._args: unknown[]) => ({})),
  updateGardenFlower: vi.fn(async (..._args: unknown[]) => ({})),
  deleteGardenFlower: vi.fn(async (..._args: unknown[]) => ({})),
}));

vi.mock("@/integrations/flowerBackend/client", () => ({ flowerClient: rpc }));
vi.mock("@/integrations/auth", () => ({
  getSignedInUserId: vi.fn(async () => "sub-anna"),
}));

import { deleteGardenFlower, listGarden, updateGardenFlower, upsertGardenFlower } from "./api";

beforeEach(() => {
  rpc.listGarden.mockReset();
  rpc.upsertGardenFlower.mockClear();
  rpc.updateGardenFlower.mockClear();
  rpc.deleteGardenFlower.mockClear();
});

describe("listGarden", () => {
  it("parses each row's params and keeps the mint state from the server", async () => {
    rpc.listGarden.mockResolvedValue({
      flowers: [
        {
          flowerId: "flw_1",
          savedName: "For Anna",
          generationWord: "Anna",
          paramsJson: '{"seed":"18446744073709551615","petalCount":19}',
          createdAt: "2026-11-01T10:00:00Z",
          isMinted: true,
          txHash: "0x11",
          tokenUri: "http://files/nft/a.json",
        },
      ],
    });

    await expect(listGarden()).resolves.toEqual([
      {
        flowerId: "flw_1",
        savedName: "For Anna",
        generationWord: "Anna",
        params: { seed: "18446744073709551615", petalCount: 19 },
        createdAt: "2026-11-01T10:00:00Z",
        isMinted: true,
        txHash: "0x11",
        tokenUri: "http://files/nft/a.json",
      },
    ]);
  });

  it("drops a row whose params cannot be read instead of failing the whole garden", async () => {
    rpc.listGarden.mockResolvedValue({
      flowers: [
        { flowerId: "flw_bad", paramsJson: "not json" },
        { flowerId: "flw_good", paramsJson: "{}" },
      ],
    });

    const rows = await listGarden();

    expect(rows.map((r) => r.flowerId)).toEqual(["flw_good"]);
  });
});

describe("upsertGardenFlower", () => {
  it("sends params as JSON", async () => {
    await upsertGardenFlower({
      flowerId: "flw_1",
      savedName: "For Anna",
      generationWord: "Anna",
      params: { petalCount: 19 },
    });

    expect(rpc.upsertGardenFlower).toHaveBeenCalledWith(
      expect.objectContaining({
        flowerId: "flw_1",
        savedName: "For Anna",
        generationWord: "Anna",
        paramsJson: '{"petalCount":19}',
      }),
    );
  });
});

describe("updateGardenFlower", () => {
  it("leaves out the fields it was not given, so the server keeps them", async () => {
    await updateGardenFlower("flw_1", { savedName: "Renamed" });

    const sent = rpc.updateGardenFlower.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.flowerId).toBe("flw_1");
    expect(sent.savedName).toBe("Renamed");
    expect(sent.generationWord).toBeUndefined();
    expect(sent.paramsJson).toBeUndefined();
  });

  it("serialises params when given", async () => {
    await updateGardenFlower("flw_1", { params: { isFavorite: true } });

    const sent = rpc.updateGardenFlower.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.paramsJson).toBe('{"isFavorite":true}');
  });
});

describe("deleteGardenFlower", () => {
  it("names the flower to remove", async () => {
    await deleteGardenFlower("flw_1");

    expect(rpc.deleteGardenFlower).toHaveBeenCalledWith(expect.objectContaining({ flowerId: "flw_1" }));
  });
});
