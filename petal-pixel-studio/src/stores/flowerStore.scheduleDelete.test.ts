import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mock the garden API BEFORE importing the store (matches flowerStore.favorites.test.ts) ──
const deleteMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => "user-123"),
  listGarden: vi.fn(async () => []),
  upsertGardenFlower: vi.fn(async () => undefined),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: (...args: unknown[]) => deleteMock(...args),
}));

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore, DELETE_GRACE_MS } from "./flowerStore";

function seedTwoFlowers() {
  const base = useFlowerStore.getState().params;
  useFlowerStore.setState({
    pendingDeleteIds: [],
    savedFlowers: [
      {
        id: "f1",
        backendFlowerId: "f1",
        title: "One",
        generationWord: "one",
        params: { ...base, flowerId: "f1" },
        createdAt: "2026-07-14",
        isMinted: false,
      },
      {
        id: "f2",
        backendFlowerId: "f2",
        title: "Two",
        generationWord: "two",
        params: { ...base, flowerId: "f2" },
        createdAt: "2026-07-14",
        isMinted: false,
      },
    ],
  });
}

describe("scheduleDelete / undoDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedTwoFlowers();
    deleteMock.mockClear();
  });

  afterEach(() => {
    // Cancel any lingering pending timers, then restore real timers.
    useFlowerStore.getState().undoDelete("f1");
    useFlowerStore.getState().undoDelete("f2");
    vi.useRealTimers();
  });

  it("hides the flower immediately but keeps it in savedFlowers until the grace elapses", () => {
    useFlowerStore.getState().scheduleDelete("f1");
    const s = useFlowerStore.getState();
    // Soft-hidden…
    expect(s.pendingDeleteIds).toContain("f1");
    // …but NOT yet hard-deleted (still recoverable).
    expect(s.savedFlowers.map((f) => f.id)).toContain("f1");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("hard-deletes (store + server) once the grace elapses if not undone", async () => {
    useFlowerStore.getState().scheduleDelete("f1");
    await vi.advanceTimersByTimeAsync(DELETE_GRACE_MS);

    const s = useFlowerStore.getState();
    expect(s.savedFlowers.map((f) => f.id)).not.toContain("f1");
    expect(s.savedFlowers.map((f) => f.id)).toContain("f2");
    expect(s.pendingDeleteIds).not.toContain("f1");
    // Server hard-delete fired for the removed flower's backend id.
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith("f1");
  });

  it("undoDelete cancels the pending delete — flower survives past the grace (no data loss)", async () => {
    useFlowerStore.getState().scheduleDelete("f1");
    expect(useFlowerStore.getState().pendingDeleteIds).toContain("f1");

    useFlowerStore.getState().undoDelete("f1");
    // Un-hidden immediately.
    expect(useFlowerStore.getState().pendingDeleteIds).not.toContain("f1");

    // Advance well past the grace: the cancelled timer must NOT fire.
    await vi.advanceTimersByTimeAsync(DELETE_GRACE_MS * 2);
    expect(useFlowerStore.getState().savedFlowers.map((f) => f.id)).toContain("f1");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown id and never double-schedules the same id", () => {
    useFlowerStore.getState().scheduleDelete("nope");
    expect(useFlowerStore.getState().pendingDeleteIds).toEqual([]);

    useFlowerStore.getState().scheduleDelete("f1");
    useFlowerStore.getState().scheduleDelete("f1");
    expect(useFlowerStore.getState().pendingDeleteIds).toEqual(["f1"]);
  });
});
