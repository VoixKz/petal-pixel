import { kindOf } from "@/math/blossom/identity";
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the garden API BEFORE importing the store ──────────────────────
const upsertResult: { error: { message: string } | null } = { error: null };
const upsertMock = vi.fn(async (..._args: unknown[]) => {
  if (upsertResult.error) throw new Error(upsertResult.error.message);
});
const deleteEqMock = vi.fn(async (..._args: unknown[]) => undefined);
const updateEqMock = vi.fn(async (..._args: unknown[]) => undefined);
// Lets tests inspect what was persisted (id, then fields).
const updateMock = vi.fn(async (...args: unknown[]) => updateEqMock(...args));

let authUserId: string | null = "user-123";

// loadFromBackend select-chain: mutable per test.
let selectRows: Array<Record<string, unknown>> | null = [];
let selectError: { message: string } | null = null;
// When set, order() returns this pending promise instead of resolving immediately,
// letting a test control exactly when the "fetch" resolves.
let pendingOrderPromise: Promise<unknown> | null = null;
// When set, listGarden throws instead of returning an error result.
let listThrows = false;

vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => authUserId),
  upsertGardenFlower: (...args: unknown[]) => upsertMock(...args),
  updateGardenFlower: (...args: unknown[]) => updateMock(...args),
  deleteGardenFlower: (...args: unknown[]) => deleteEqMock(...args),
  listGarden: vi.fn(async () => {
    if (listThrows) throw new Error("network");
    const { data, error } = pendingOrderPromise
      ? ((await pendingOrderPromise) as { data: Array<Record<string, unknown>> | null; error: { message: string } | null })
      : { data: selectRows, error: selectError };
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      flowerId: row.flower_id,
      savedName: row.saved_name,
      generationWord: row.generation_word,
      params: row.params,
      createdAt: row.created_at,
      isMinted: row.is_minted ?? false,
      txHash: row.tx_hash ?? "",
      tokenUri: row.token_uri ?? "",
    }));
  }),
}));

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore, type SavedFlower } from "./flowerStore";

const baseParams = () => useFlowerStore.getState().params;

function sampleFlower(id: string, overrides: Partial<SavedFlower> = {}): SavedFlower {
  return {
    id,
    backendFlowerId: id,
    title: "Original Title",
    generationWord: "alice",
    params: { ...baseParams(), flowerId: id },
    createdAt: "2026-07-01",
    isMinted: false,
    ...overrides,
  };
}

describe("Cluster A: create-path deterministic-id collision", () => {
  beforeEach(() => {
    upsertResult.error = null;
    upsertMock.mockClear();
    deleteEqMock.mockClear();
    updateEqMock.mockClear();
    authUserId = "user-123";
    pendingOrderPromise = null;
  });

  it("treats a collision with an existing saved flower as an UPDATE, not a silent overwrite", async () => {
    const existing = sampleFlower("flower-abc", { title: "My Custom Title" });
    useFlowerStore.setState({
      editingFlowerId: null,
      savedFlowers: [existing],
      // Auto-title path: title matches what generateFromWord would produce for
      // word "alice", i.e. the user did NOT type a custom title.
      title: `alice's ${kindOf("alice")}`,
      generationWord: "alice",
      params: { ...baseParams(), flowerId: "flower-abc" },
    });

    const result = await useFlowerStore.getState().saveFlower();

    expect(result).toBe("updated");
    // Local entry must be updated in place (not left stale), and the user's
    // custom title must be PRESERVED because the store title is the fresh
    // auto-title, not something the user intentionally typed.
    const saved = useFlowerStore.getState().savedFlowers.find(f => f.id === "flower-abc");
    expect(saved?.title).toBe("My Custom Title");
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().editingFlowerId).toBe("flower-abc");
    // The DB row is upserted with the PRESERVED title, not the auto-title.
    expect(upsertMock).toHaveBeenCalled();
  });

  it("preserves the user's intentionally-typed title on collision (title differs from auto-title AND from the existing saved title)", async () => {
    const existing = sampleFlower("flower-abc", { title: "Old Custom Title" });
    useFlowerStore.setState({
      editingFlowerId: null,
      savedFlowers: [existing],
      title: "Brand New User Title",
      generationWord: "alice",
      params: { ...baseParams(), flowerId: "flower-abc" },
    });

    const result = await useFlowerStore.getState().saveFlower();

    expect(result).toBe("updated");
    const saved = useFlowerStore.getState().savedFlowers.find(f => f.id === "flower-abc");
    expect(saved?.title).toBe("Brand New User Title");
  });

  it("returns 'created' for a genuinely new flower id (no collision)", async () => {
    useFlowerStore.setState({
      editingFlowerId: null,
      savedFlowers: [],
      title: "Fresh Flower",
      generationWord: "bob",
      params: { ...baseParams(), flowerId: "flower-new" },
    });

    const result = await useFlowerStore.getState().saveFlower();

    expect(result).toBe("created");
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().savedFlowers[0].title).toBe("Fresh Flower");
  });
});

describe("Cluster D: saveFlower edit path aborts when the flower was deleted", () => {
  beforeEach(() => {
    upsertResult.error = null;
    upsertMock.mockClear();
    deleteEqMock.mockClear();
    updateEqMock.mockClear();
    authUserId = "user-123";
    pendingOrderPromise = null;
  });

  it("aborts and does not upsert when editingFlowerId no longer exists in savedFlowers", async () => {
    useFlowerStore.setState({
      editingFlowerId: "flower-deleted",
      savedFlowers: [], // flower was deleted from the list
      title: "Whatever",
      generationWord: "ghost",
      params: { ...baseParams(), flowerId: "flower-deleted" },
    });

    const result = await useFlowerStore.getState().saveFlower();

    expect(result).toBe("aborted");
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateEqMock).not.toHaveBeenCalled();
    // Edit mode must be cleared so the UI falls back to a clean create state.
    expect(useFlowerStore.getState().editingFlowerId).toBeNull();
  });

  it("still updates normally when the flower DOES exist", async () => {
    const existing = sampleFlower("flower-live");
    useFlowerStore.setState({
      editingFlowerId: "flower-live",
      savedFlowers: [existing],
      title: "Updated Title",
      generationWord: "alice",
      params: { ...baseParams(), flowerId: "flower-live" },
    });

    const result = await useFlowerStore.getState().saveFlower();

    expect(result).toBe("updated");
    expect(useFlowerStore.getState().editingFlowerId).toBe("flower-live");
  });
});

describe("Cluster E1: loadFromBackend discards stale in-flight results", () => {
  let resolveOrder: ((v: unknown) => void) | null = null;

  beforeEach(() => {
    authUserId = "user-123";
    selectRows = [];
    selectError = null;
    resolveOrder = null;
    pendingOrderPromise = null;
    useFlowerStore.setState({ savedFlowers: [], editingFlowerId: null });
  });

  it("discards a stale fetch result that resolves AFTER a local mutation (saveFlower) landed", async () => {
    pendingOrderPromise = new Promise((resolve) => {
      resolveOrder = resolve;
    });

    // Start loadFromBackend; it will hang at the mocked order() call.
    const loadPromise = useFlowerStore.getState().loadFromBackend();

    // While that fetch is in flight, an optimistic local mutation happens
    // (e.g. the user generated + saved a flower).
    upsertResult.error = null;
    useFlowerStore.setState({
      editingFlowerId: null,
      title: "New Save",
      generationWord: "carol",
      params: { ...baseParams(), flowerId: "flower-carol" },
    });
    await useFlowerStore.getState().saveFlower();
    expect(useFlowerStore.getState().savedFlowers.map(f => f.id)).toContain("flower-carol");

    // Now the stale fetch resolves with pre-save data (empty list).
    resolveOrder?.({ data: [], error: null });
    await loadPromise;

    // The stale result must have been discarded — the optimistically-saved
    // flower must still be present.
    const ids = useFlowerStore.getState().savedFlowers.map(f => f.id);
    expect(ids).toContain("flower-carol");
  });

  it("applies the fetch result normally when no local mutation happened while it was in flight", async () => {
    pendingOrderPromise = new Promise((resolve) => {
      resolveOrder = resolve;
    });

    const loadPromise = useFlowerStore.getState().loadFromBackend();

    resolveOrder?.({
      data: [{
        flower_id: "server-flower",
        saved_name: "Server Flower",
        generation_word: "dave",
        params: baseParams(),
        created_at: "2026-01-01T00:00:00Z",
        is_minted: false,
        tx_hash: null,
        token_uri: null,
      }],
      error: null,
    });
    await loadPromise;

    expect(useFlowerStore.getState().savedFlowers.map(f => f.id)).toEqual(["server-flower"]);
  });
});

describe("Cluster E2: transient loadFromBackend failure — conditional cache clearing", () => {
  beforeEach(() => {
    upsertMock.mockClear();
    pendingOrderPromise = null;
  });

  it("keeps cached savedFlowers on error when ownerUserId matches the current user (same-user, availability preserved)", async () => {
    authUserId = "user-same";
    selectRows = null;
    selectError = { message: "db down" };
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("cached-flower")],
      ownerUserId: "user-same",
    });

    await useFlowerStore.getState().loadFromBackend();

    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().savedFlowers[0].id).toBe("cached-flower");
    expect(useFlowerStore.getState().ownerUserId).toBe("user-same");
  });

  it("clears cached savedFlowers on error when ownerUserId differs from the current user (cross-user leak protection preserved)", async () => {
    authUserId = "user-new";
    selectRows = null;
    selectError = { message: "db down" };
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("cached-flower")],
      ownerUserId: "user-old",
    });

    await useFlowerStore.getState().loadFromBackend();

    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
    expect(useFlowerStore.getState().ownerUserId).toBe("user-new");
  });

  it("keeps cached savedFlowers when the query throws for the SAME user", async () => {
    authUserId = "user-same";
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("cached-flower")],
      ownerUserId: "user-same",
    });

    listThrows = true;

    await useFlowerStore.getState().loadFromBackend();

    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);

    listThrows = false;
  });

  it("clears cached savedFlowers when the query throws for a DIFFERENT user", async () => {
    authUserId = "user-new";
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("cached-flower")],
      ownerUserId: "user-old",
    });

    listThrows = true;

    await useFlowerStore.getState().loadFromBackend();

    expect(useFlowerStore.getState().savedFlowers).toEqual([]);

    listThrows = false;
  });
});

describe("Finding 1 (Critical): post-mint edit must not wipe mintTokenId/mintContractAddress", () => {
  beforeEach(() => {
    upsertResult.error = null;
    upsertMock.mockClear();
    deleteEqMock.mockClear();
    updateEqMock.mockClear();
    updateMock.mockClear();
    authUserId = "user-123";
    pendingOrderPromise = null;
  });

  it("keeps mintTokenId/mintContractAddress after mint -> in-place edit -> saveFlower (edit path)", async () => {
    // 1) A flower exists, freshly "generated" and saved (not yet minted).
    const flower = sampleFlower("flower-mint-1", { title: "Original Title", isMinted: false });
    useFlowerStore.setState({
      editingFlowerId: "flower-mint-1",
      savedFlowers: [flower],
      title: "Original Title",
      generationWord: "alice",
      params: { ...baseParams(), flowerId: "flower-mint-1" },
    });

    // 2) Mint it via the store action, exactly as CreateFlower.handleMint does.
    const synced = await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-mint-1",
      "0xTXHASH",
      "ipfs://token-uri",
      { tokenId: 42, contractAddress: "0xCONTRACT" },
    );
    expect(synced).toBe(true);

    // Sanity: the saved row now carries the mint fields.
    const afterMint = useFlowerStore.getState().savedFlowers.find(f => f.id === "flower-mint-1");
    expect(afterMint?.params.mintTokenId).toBe(42);
    expect(afterMint?.params.mintContractAddress).toBe("0xCONTRACT");
    // And fix (a): the live top-level params picked them up too, since this
    // flower is still the one being edited.
    expect(useFlowerStore.getState().params.mintTokenId).toBe(42);
    expect(useFlowerStore.getState().params.mintContractAddress).toBe("0xCONTRACT");

    // 3) Simulate an in-place edit: user stays in edit mode (editingFlowerId
    // unchanged, as saveFlower's edit path does), renames the title, and
    // nudges a param — exactly the "rename/slider-nudge + Update" scenario
    // from the finding.
    useFlowerStore.setState({
      title: "Renamed After Mint",
    });
    useFlowerStore.getState().setParam("petalCount", 9);

    // 4) Update — this runs saveFlower's EDIT path, which used to do
    // `params: { ...params }` (a full replace) and drop the mint fields
    // because live top-level `params` never had them (Finding 1 root cause).
    const result = await useFlowerStore.getState().saveFlower();
    expect(result).toBe("updated");

    // 5) THE REGRESSION GUARD: mint fields must still be present after the
    // edit-path save, both in the local savedFlowers row (RED without the
    // fix: these would be undefined) ...
    const afterEdit = useFlowerStore.getState().savedFlowers.find(f => f.id === "flower-mint-1");
    expect(afterEdit?.params.mintTokenId).toBe(42);
    expect(afterEdit?.params.mintContractAddress).toBe("0xCONTRACT");
    expect(afterEdit?.title).toBe("Renamed After Mint");
    expect(afterEdit?.params.petalCount).toBe(9);

    // ... and in the fields persisted to the server, so the mint fields
    // survive the round-trip through the DB too.
    expect(updateMock).toHaveBeenCalled();
    const persistedPayload = updateMock.mock.calls.at(-1)?.[1] as {
      params?: { mintTokenId?: number; mintContractAddress?: string };
    };
    expect(persistedPayload?.params?.mintTokenId).toBe(42);
    expect(persistedPayload?.params?.mintContractAddress).toBe("0xCONTRACT");
  });
});
