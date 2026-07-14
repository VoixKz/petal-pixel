import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ConnectError } from "@connectrpc/connect";
import {
  BLOOM_TYPES,
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  FLOWER_TYPES,
  type BloomParams,
  type ClassicParams,
  type FlowerFamily,
  type FlowerType,
  type RhodoneaParams,
  type RoseParams,
  type SuperformulaParams,
  type SunflowerParams,
} from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { toTechniqueParams, toV2Params } from "@/math/flowerGeometry";
import { createFlowerViaGrpc } from "@/integrations/flowerBackend/client";
import { supabase } from "@/integrations/supabase/client";
import { V2_COLOR_A, V2_COLOR_B } from "@/lib/v2Colors";

export interface FlowerParams {
  flowerId: string;
  algoVersion: string;
  schemaVersion: string;
  seed: string;

  flowerType: FlowerType;
  classicParams: ClassicParams;
  roseParams: RoseParams;
  bloomParams: BloomParams;

  petalCount: number;
  petalLength: number;
  petalSharpness: number;
  noiseIntensity: number;
  frequency: number;
  rotation: number;
  symmetry: number;
  colorA: string;
  colorB: string;
  glowIntensity: number;
  material: "glass" | "matte" | "metallic";
  idleMotion: boolean;
  rotationSpeed: number;
  stemEnabled: boolean;

  // v2 additive fields (undefined on v1 records). classicParams/roseParams/bloomParams
  // are reused for the 6 existing families; palette threads onto them.
  family?: FlowerFamily;
  palette?: Palette;
  sunflowerParams?: SunflowerParams;
  rhodoneaParams?: RhodoneaParams;
  superformulaParams?: SuperformulaParams;

  // Mint results: stored inside params so they round-trip through the existing
  // params jsonb column with zero DB migration. Set at mint time only.
  mintTokenId?: number;
  mintContractAddress?: string;

  // Favorites: mirrored into params jsonb (same precedent as mintTokenId) so the
  // flag is durable through the authoritative Supabase reload, not just local
  // state / localStorage. See toggleFavorite + loadFromBackend's mapper.
  isFavorite?: boolean;
}

export interface SavedFlower {
  id: string;
  backendFlowerId?: string;
  title: string;
  generationWord: string;
  params: FlowerParams;
  createdAt: string;
  isMinted: boolean;
  txHash?: string;
  tokenUri?: string;
  isFavorite?: boolean;
}

interface FlowerStore {
  params: FlowerParams;
  generationWord: string;
  title: string;
  editingFlowerId: string | null;
  savedFlowers: SavedFlower[];
  isGenerating: boolean;
  lastError: string;
  /** The user id whose flowers are currently cached. Used to detect cross-user rehydration. */
  ownerUserId: string | null;

  setParam: <K extends keyof FlowerParams>(key: K, value: FlowerParams[K]) => void;
  setFlowerType: (flowerType: FlowerType) => void;
  setClassicParam: <K extends keyof ClassicParams>(key: K, value: ClassicParams[K]) => void;
  setRoseParam: <K extends keyof RoseParams>(key: K, value: RoseParams[K]) => void;
  setBloomParam: <K extends keyof BloomParams>(key: K, value: BloomParams[K]) => void;

  setGenerationWord: (word: string) => void;
  setTitle: (title: string) => void;
  generateFromWord: (word: string) => Promise<void>;
  /**
   * Returns which case occurred so the caller (CreateFlower) can choose the
   * right toast message:
   *  - 'created': a genuinely new flower was added.
   *  - 'updated': either the edit path succeeded, or the create path collided
   *    with an already-saved flower's deterministic id and was treated as an
   *    update of that flower (Cluster A).
   *  - 'aborted': the edit path targeted a flower that no longer exists in
   *    savedFlowers (deleted) — nothing was written (Cluster D).
   */
  saveFlower: () => Promise<'created' | 'updated' | 'aborted'>;
  updateFlowerTitle: (id: string, newTitle: string) => Promise<void>;
  deleteFlower: (id: string) => Promise<void>;
  loadFlowerForEdit: (flower: SavedFlower) => void;
  clearEditMode: () => void;
  mintFlower: (id: string) => void;
  /** Toggle the persisted favorite flag on a saved flower (consumed by feat-galleries). */
  toggleFavorite: (id: string) => Promise<void>;
  markMintedByBackendFlowerId: (
    backendFlowerId: string,
    txHash?: string,
    tokenUri?: string,
    mint?: { tokenId?: number; contractAddress?: string },
  ) => Promise<boolean>;
  loadFromBackend: () => Promise<void>;
  resetParams: () => void;
  resetFlowerStore: () => void;
}

function hueToHex(hue: number, saturation = 70, lightness = 52) {
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ─── Cluster E1: mutation-vs-fetch race guard ─────────────────────────────────
// Monotonically increasing counter bumped by every local mutation that writes
// savedFlowers (saveFlower create/edit, updateFlowerTitle, deleteFlower,
// markMintedByBackendFlowerId, resetFlowerStore). loadFromBackend captures the
// counter before its fetch starts and discards the fetched result if the
// counter changed while the fetch was in flight — otherwise a slow fetch that
// started before an optimistic local mutation could land after it and clobber
// it with pre-mutation data (last-write-wins bug).
let savedFlowersMutationCounter = 0;
function bumpSavedFlowersMutationCounter() {
  savedFlowersMutationCounter += 1;
  return savedFlowersMutationCounter;
}

function seedToDisplay(seed: bigint) {
  return seed.toString();
}

function generateAutoTitle(word: string, flowerType: FlowerType | FlowerFamily): string {
  const prefixes = ["Celestial", "Aurora", "Crystal", "Nebula", "Astral", "Phantom", "Luminous", "Ethereal"];
  const typeNames: Record<FlowerFamily, string> = {
    classic: "Bloom",
    rose: "Rose",
    zinnia: "Zinnia",
    camellia: "Camellia",
    lotus: "Lotus",
    dahlia: "Dahlia",
    sunflower: "Sunflower",
    rhodonea: "Rhodonea",
    superformula: "Superformula",
  };

  const hash = Array.from(word).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `${prefixes[hash % prefixes.length]} ${typeNames[flowerType as FlowerFamily] ?? "Bloom"}`;
}

const defaultParams: FlowerParams = {
  flowerId: "",
  algoVersion: "v1",
  schemaVersion: "v1",
  seed: "0",

  flowerType: "classic",
  classicParams: { ...DEFAULT_CLASSIC_PARAMS },
  roseParams: { ...DEFAULT_ROSE_PARAMS },
  bloomParams: { ...DEFAULT_BLOOM_PARAMS },

  petalCount: 6,
  petalLength: 1.2,
  petalSharpness: 0.5,
  noiseIntensity: 0.3,
  frequency: 2,
  rotation: 0,
  symmetry: 6,
  colorA: V2_COLOR_A,
  colorB: V2_COLOR_B,
  glowIntensity: 0.5,
  material: "matte",
  idleMotion: true,
  rotationSpeed: 0.5,
  stemEnabled: false,
};

// ─── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseUpsertFlower(
  userId: string,
  flowerId: string,
  title: string,
  generationWord: string,
  params: FlowerParams,
) {
  const { error } = await supabase.from('user_flowers').upsert(
    {
      user_id: userId,
      flower_id: flowerId,
      saved_name: title,
      generation_word: generationWord,
      params: params as unknown as import('@/integrations/supabase/types').Json,
    },
    { onConflict: 'user_id,flower_id' },
  );
  if (error) throw new Error(error.message);
}

async function supabaseUpdateFlower(
  userId: string,
  flowerId: string,
  fields: { saved_name?: string; generation_word?: string; params?: FlowerParams },
) {
  const { error } = await supabase.from('user_flowers')
    .update({
      ...fields,
      ...(fields.params ? { params: fields.params as unknown as import('@/integrations/supabase/types').Json } : {}),
    })
    .eq('user_id', userId)
    .eq('flower_id', flowerId);
  if (error) throw new Error(error.message);
}

// ──────────────────────────────────────────────────────────────────────────────

export const useFlowerStore = create<FlowerStore>()(
  persist(
  (set, get) => ({
  params: defaultParams,
  generationWord: "",
  title: "Untitled Flower",
  editingFlowerId: null,
  isGenerating: false,
  lastError: "",
  savedFlowers: [],
  ownerUserId: null,

  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),

  setFlowerType: (flowerType) => set((s) => ({ params: { ...s.params, flowerType } })),

  setClassicParam: (key, value) =>
    set((s) => ({
      params: {
        ...s.params,
        classicParams: { ...s.params.classicParams, [key]: value },
      },
    })),

  setRoseParam: (key, value) =>
    set((s) => ({
      params: {
        ...s.params,
        roseParams: { ...s.params.roseParams, [key]: value },
      },
    })),

  setBloomParam: (key, value) =>
    set((s) => ({
      params: {
        ...s.params,
        bloomParams: { ...s.params.bloomParams, [key]: value },
      },
    })),

  setGenerationWord: (word) => set({ generationWord: word }),

  setTitle: (title) => set({ title }),

  generateFromWord: async (word) => {
    const trimmed = word.trim();
    if (!trimmed) return;

    set({ isGenerating: true, lastError: "" });

    try {
      const response = await createFlowerViaGrpc(trimmed);
      const backendParams = response.params;
      if (!backendParams) {
        throw new Error("Backend returned empty params");
      }

      const seed = backendParams.seed;

      // ── v2 path: backend is source of truth (family + palette + oneof shape) ──
      if (backendParams.algoVersion === "v2" && backendParams.family) {
        const v2 = toV2Params(backendParams);
        const autoTitle = generateAutoTitle(trimmed, v2.family);
        set({
          params: {
            ...get().params,
            flowerId: response.flowerId,
            algoVersion: backendParams.algoVersion,
            schemaVersion: backendParams.schemaVersion,
            seed: seedToDisplay(seed),
            family: v2.family,
            palette: v2.palette,
            // reuse existing slots for the 6 shared families; leave others at defaults
            flowerType: (FLOWER_TYPES as readonly string[]).includes(v2.family)
              ? (v2.family as FlowerType)
              : get().params.flowerType,
            classicParams: v2.classicParams ?? get().params.classicParams,
            roseParams: v2.roseParams ?? get().params.roseParams,
            bloomParams: v2.bloomParams ?? get().params.bloomParams,
            sunflowerParams: v2.sunflowerParams,
            rhodoneaParams: v2.rhodoneaParams,
            superformulaParams: v2.superformulaParams,
            rotation: Number(seed % BigInt(360)),
            // v2 colors are FIXED constants (shared with shareParams so studio ==
            // /share). Setting them explicitly also fixes the bleed bug where
            // `...get().params` carried a prior v1 flower's hue-derived hsl into a
            // v2 flower's emissive/point-light tint.
            colorA: V2_COLOR_A,
            colorB: V2_COLOR_B,
            // Refresh the UI read-outs and clear any leftover v1 stem so a v2
            // flower never inherits a stem from a previously-generated v1 one.
            petalCount: Math.max(3, backendParams.petalCount || 6),
            petalLength: backendParams.petalLength || 1.2,
            stemEnabled: false,
          },
          generationWord: trimmed,
          title: get().editingFlowerId ? get().title : autoTitle,
          editingFlowerId: get().editingFlowerId,
        });
      } else {
        // ── v1 path: EXACTLY today's behavior (toTechniqueParams fallback) ──
        const technique = toTechniqueParams(seed, backendParams);
        const hue = backendParams.hue;
        const baseCount = Math.max(3, backendParams.petalCount || 6);
        const autoTitle = generateAutoTitle(trimmed, technique.flowerType);

        set({
          params: {
            ...get().params,
            flowerId: response.flowerId,
            algoVersion: backendParams.algoVersion,
            schemaVersion: backendParams.schemaVersion,
            seed: seedToDisplay(seed),
            flowerType: technique.flowerType,
            classicParams: technique.classicParams,
            roseParams: technique.roseParams,
            bloomParams: technique.bloomParams,
            petalCount: baseCount,
            petalLength: clamp(backendParams.petalLength || 1.2, 0.25, 3),
            petalSharpness: clamp(backendParams.petalWidth || 0.5, 0.05, 1.4),
            noiseIntensity: clamp(Math.abs(backendParams.curvature || 0.2), 0, 1),
            frequency: 1 + Number(seed % BigInt(6)),
            rotation: Number(seed % BigInt(360)),
            symmetry: clamp(baseCount, 3, 18),
            colorA: hueToHex(hue, 72, 52),
            colorB: hueToHex((hue + 48) % 360, 66, 45),
            stemEnabled: (backendParams.stemHeight || 0) > 0.95,
          },
          generationWord: trimmed,
          title: get().editingFlowerId ? get().title : autoTitle,
          editingFlowerId: get().editingFlowerId,
        });
      }
    } catch (error) {
      const message = error instanceof ConnectError ? error.rawMessage : error instanceof Error ? error.message : "Failed to generate flower";
      set({ lastError: message });
      throw error;
    } finally {
      set({ isGenerating: false });
    }
  },

  saveFlower: async () => {
    const { params, title, generationWord, savedFlowers, editingFlowerId } = get();

    if (editingFlowerId) {
      // ── Edit path ────────────────────────────────────────────────────────────
      const existing = savedFlowers.find(f => f.id === editingFlowerId);

      // Cluster D: the flower being edited was deleted out from under this
      // session (e.g. deleted in another tab, or a stale Back-navigation into
      // an old edit entry after deletion). Upserting here would resurrect a
      // row the user explicitly deleted. Abort instead of writing anything.
      if (!existing) {
        set({ editingFlowerId: null });
        return 'aborted';
      }

      const oldBackendId = existing.backendFlowerId;
      const newBackendId = params.flowerId || oldBackendId;
      const regenerated = Boolean(newBackendId && newBackendId !== oldBackendId);

      // Finding 1 (Critical), fix (b): the live top-level `params` may not
      // carry mintTokenId/mintContractAddress even though the saved row
      // does (e.g. markMintedByBackendFlowerId folded them into `params`
      // via fix (a) only when this flower was the live one at mint time;
      // older sessions or edge cases could still miss it). Preserve those
      // two fields from the existing saved row whenever the live params
      // don't already have them, so a plain rename/slider-nudge + Update
      // can never silently drop a recorded mint. Only these two fields are
      // merged — everything else in `params` is a full replace as before.
      const mintTokenId = params.mintTokenId ?? existing.params.mintTokenId;
      const mintContractAddress = params.mintContractAddress ?? existing.params.mintContractAddress;
      const persistedParams: FlowerParams = {
        ...params,
        ...(mintTokenId != null ? { mintTokenId } : {}),
        ...(mintContractAddress ? { mintContractAddress } : {}),
      };

      const updated = savedFlowers.map((f) =>
        f.id === editingFlowerId
          ? {
              ...f,
              title,
              generationWord: generationWord || f.generationWord,
              params: persistedParams,
              backendFlowerId: newBackendId || f.backendFlowerId,
            }
          : f,
      );
      set({ savedFlowers: updated });
      bumpSavedFlowersMutationCounter();

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        set({ ownerUserId: user.id });
        if (regenerated && newBackendId) {
          // Flower was re-generated with a new word → new backend ID
          await supabaseUpsertFlower(
            user.id,
            newBackendId,
            title,
            generationWord || existing.generationWord || "unknown",
            persistedParams,
          );
          if (oldBackendId) {
            await supabase.from('user_flowers')
              .delete()
              .eq('user_id', user.id)
              .eq('flower_id', oldBackendId);
          }
        } else if (newBackendId) {
          await supabaseUpdateFlower(user.id, newBackendId, {
            saved_name: title,
            generation_word: generationWord || existing.generationWord,
            params: persistedParams,
          });
        }
      }
      return 'updated';
    }

    // ── Create path ───────────────────────────────────────────────────────────
    // Use the backend flower ID as the local id so all saves are idempotent.
    const newId = params.flowerId;
    if (!newId) return 'aborted'; // guard — should have been caught by handleSave already

    // Cluster A: backend flowerIds are deterministic per generation word, so
    // re-generating a word that was already saved collides with the existing
    // saved flower's id. Treat that as an UPDATE of the existing flower
    // instead of silently overwriting its DB row while leaving the local
    // list stale.
    const existing = savedFlowers.find(f => f.id === newId);
    if (existing) {
      // Preserve the existing saved title UNLESS the user's current title
      // differs from what generateFromWord would have auto-titled it — that
      // divergence means the user intentionally typed a new title.
      const autoTitle = generateAutoTitle(
        generationWord || existing.generationWord,
        params.family ?? params.flowerType,
      );
      const userTypedTitle = title !== autoTitle;
      const resolvedTitle = userTypedTitle ? title : existing.title;

      const updated = savedFlowers.map((f) =>
        f.id === newId
          ? {
              ...f,
              title: resolvedTitle,
              generationWord: generationWord || f.generationWord,
              params: { ...params },
              backendFlowerId: newId,
            }
          : f,
      );
      set({ savedFlowers: updated, editingFlowerId: newId, title: resolvedTitle });
      bumpSavedFlowersMutationCounter();

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        set({ ownerUserId: user.id });
        await supabaseUpsertFlower(user.id, newId, resolvedTitle, generationWord || existing.generationWord || "unknown", params);
      }
      return 'updated';
    }

    const newFlower: SavedFlower = {
      id: newId,
      backendFlowerId: newId,
      title,
      generationWord: generationWord || "unknown",
      params: { ...params },
      createdAt: new Date().toISOString().split("T")[0],
      isMinted: false,
    };

    set({ savedFlowers: [...savedFlowers, newFlower], editingFlowerId: newId });
    bumpSavedFlowersMutationCounter();

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      set({ ownerUserId: user.id });
      await supabaseUpsertFlower(user.id, newId, title, generationWord || "unknown", params);
    }
    return 'created';
  },

  updateFlowerTitle: async (id, newTitle) => {
    const { savedFlowers } = get();
    const updated = savedFlowers.map((f) =>
      f.id === id ? { ...f, title: newTitle } : f,
    );
    set({ savedFlowers: updated });
    bumpSavedFlowersMutationCounter();

    const flower = savedFlowers.find(f => f.id === id);
    const flowerId = flower?.backendFlowerId;
    if (flowerId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabaseUpdateFlower(user.id, flowerId, { saved_name: newTitle });
      }
    }
  },

  deleteFlower: async (id) => {
    const { savedFlowers } = get();
    const flower = savedFlowers.find(f => f.id === id);
    set({ savedFlowers: savedFlowers.filter(f => f.id !== id) });
    bumpSavedFlowersMutationCounter();

    const flowerId = flower?.backendFlowerId;
    if (flowerId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_flowers')
          .delete()
          .eq('user_id', user.id)
          .eq('flower_id', flowerId);
      }
    }
  },

  loadFlowerForEdit: (flower) => {
    set({
      params: { ...flower.params },
      title: flower.title,
      generationWord: flower.generationWord,
      editingFlowerId: flower.id,
    });
  },

  clearEditMode: () => {
    set({
      editingFlowerId: null,
      params: defaultParams,
      title: "Untitled Flower",
      generationWord: "",
    });
  },

  mintFlower: (id) =>
    set((s) => ({
      savedFlowers: s.savedFlowers.map((f) =>
        f.id === id ? { ...f, isMinted: true } : f,
      ),
    })),

  toggleFavorite: async (id) => {
    const { savedFlowers } = get();
    const target = savedFlowers.find((f) => f.id === id);
    if (!target) return; // unknown id → no-op
    const next = !target.isFavorite;
    // Dual-write: the local flag AND params.isFavorite (durable via params jsonb).
    const updated = savedFlowers.map((f) =>
      f.id === id ? { ...f, isFavorite: next, params: { ...f.params, isFavorite: next } } : f,
    );
    set({ savedFlowers: updated });
    bumpSavedFlowersMutationCounter();

    // Best-effort Supabase sync (mirrors the params jsonb). No-op when the
    // flower has no backend id or the user is signed out; failures are swallowed
    // since the local optimistic update already reflects the intent.
    const flowerId = target.backendFlowerId;
    if (!flowerId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const params = updated.find((f) => f.id === id)?.params;
      if (params) await supabaseUpdateFlower(user.id, flowerId, { params });
    }
  },

  markMintedByBackendFlowerId: async (backendFlowerId, txHash, tokenUri, mint) => {
    // Optimistic local update. Mint results are stamped into params so they
    // persist through the params jsonb round-trip (no DB migration).
    set((s) => {
      // Finding 1 (Critical): if the minted flower is also the one currently
      // loaded into the live top-level `params` (edit mode, or freshly
      // generated/saved), fold the mint fields into `params` too. Otherwise
      // `params` never learns about the mint, and a subsequent edit+Update
      // (saveFlower's edit path does `params: { ...params }`, a full
      // replace) would overwrite savedFlowers[i].params — and Supabase —
      // with a copy that lacks mintTokenId/mintContractAddress, silently
      // erasing them.
      const isLiveParams =
        s.editingFlowerId === backendFlowerId || s.params.flowerId === backendFlowerId;
      const mintFieldsPatch =
        mint
          ? {
              ...(mint.tokenId != null ? { mintTokenId: mint.tokenId } : {}),
              ...(mint.contractAddress ? { mintContractAddress: mint.contractAddress } : {}),
            }
          : {};

      return {
        savedFlowers: s.savedFlowers.map((f) =>
          f.backendFlowerId === backendFlowerId
            ? {
                ...f,
                isMinted: true,
                txHash: txHash ?? f.txHash,
                tokenUri: tokenUri ?? f.tokenUri,
                params: mint ? { ...f.params, ...mintFieldsPatch } : f.params,
              }
            : f,
        ),
        params:
          isLiveParams && mint ? { ...s.params, ...mintFieldsPatch } : s.params,
      };
    });
    bumpSavedFlowersMutationCounter();

    // Persist to Supabase; report failure to the caller instead of swallowing it.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return true; // nothing to sync (not signed in)

      const updatedParams = get().savedFlowers.find(
        (f) => f.backendFlowerId === backendFlowerId,
      )?.params;

      const { error } = await supabase.from('user_flowers')
        .update({
          is_minted: true,
          tx_hash: txHash ?? null,
          token_uri: tokenUri ?? null,
          ...(mint && updatedParams
            ? { params: updatedParams as unknown as import('@/integrations/supabase/types').Json }
            : {}),
        })
        .eq('user_id', user.id)
        .eq('flower_id', backendFlowerId);
      if (error) {
        console.error('markMintedByBackendFlowerId sync error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('markMintedByBackendFlowerId failed:', err);
      return false;
    }
  },

  // ── Load from Supabase (single source of truth) ───────────────────────────
  // Does NOT require the Go backend to be running — all data is in Supabase.
  loadFromBackend: async () => {
    // Cluster E1: capture the mutation counter before the fetch starts. If a
    // local mutation (save/update/delete/mint/reset) happens while this fetch
    // is in flight, the counter will have moved by the time we get a result —
    // meaning the fetched data is stale relative to a newer local write, and
    // must be discarded rather than clobbering it (last-write-wins bug).
    const tokenAtStart = savedFlowersMutationCounter;
    const isStale = () => savedFlowersMutationCounter !== tokenAtStart;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rows, error } = await supabase
        .from('user_flowers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (isStale()) {
        console.debug('loadFromBackend: discarding stale result (local mutation happened while in flight)');
        return;
      }

      if (error) {
        console.error('loadFromBackend error:', error);
        // Cluster E2: only clear the cache when it belongs to a DIFFERENT
        // user (cross-user leak protection). For the SAME user, a transient
        // fetch failure should not destroy an otherwise-good local cache —
        // keep it for availability. Either way, stamp ownerUserId so the
        // cross-user guard stays armed if the very first load fails.
        const { ownerUserId: cachedOwnerId } = get();
        if (cachedOwnerId && cachedOwnerId !== user.id) {
          set({ savedFlowers: [], ownerUserId: user.id });
        } else {
          set({ ownerUserId: user.id });
        }
        return;
      }

      if (!rows?.length) {
        set({ savedFlowers: [], ownerUserId: user.id });
        return;
      }

      const mapped: SavedFlower[] = rows
        .filter(row => row.params != null)
        .map(row => ({
          id: row.flower_id,
          backendFlowerId: row.flower_id,
          title: row.saved_name || 'Untitled Flower',
          generationWord: row.generation_word || '',
          params: row.params as unknown as FlowerParams,
          createdAt: new Date(row.created_at).toISOString().split('T')[0],
          isMinted: row.is_minted ?? false,
          txHash: row.tx_hash ?? undefined,
          tokenUri: row.token_uri ?? undefined,
          isFavorite: (row.params as unknown as FlowerParams)?.isFavorite ?? false,
        }));

      set({ savedFlowers: mapped, ownerUserId: user.id });
    } catch (err) {
      console.error('loadFromBackend failed:', err);
      if (isStale()) {
        console.debug('loadFromBackend: discarding stale error path (local mutation happened while in flight)');
        return;
      }
      // Cluster E2: same conditional-clearing rule as the error branch above.
      // We may not have resolved `user` here (auth.getUser() itself could be
      // what threw), so fall back to clearing only when we can't confirm the
      // cache still belongs to the current session.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { ownerUserId: cachedOwnerId } = get();
        if (user && cachedOwnerId && cachedOwnerId !== user.id) {
          set({ savedFlowers: [], ownerUserId: user.id });
        } else if (user) {
          set({ ownerUserId: user.id });
        }
        // If we can't even confirm the user here, leave the cache untouched —
        // it's still the best guess we have and no cross-user risk is provable.
      } catch {
        // Truly can't tell who the user is; keep the cache as-is (availability).
      }
    }
  },

  resetParams: () =>
    set((s) => ({
      params: {
        ...defaultParams,
        colorA: s.params.colorA,
        colorB: s.params.colorB,
      },
      lastError: "",
      editingFlowerId: null,
      title: "Untitled Flower",
      generationWord: "",
    })),

  resetFlowerStore: () => {
    set({
      savedFlowers: [],
      params: defaultParams,
      editingFlowerId: null,
      title: "Untitled Flower",
      generationWord: "",
      lastError: "",
      ownerUserId: null,
    });
    bumpSavedFlowersMutationCounter();
    useFlowerStore.persist.clearStorage();
  },
  }),
  {
    name: 'petal-pixel-flowers',
    // Keep savedFlowers and ownerUserId in localStorage as a fast-load cache.
    // loadFromBackend always overwrites it with the authoritative Supabase data.
    // ownerUserId is persisted so cross-user tab-reuse can be detected on next login.
    partialize: (s) => ({ savedFlowers: s.savedFlowers, ownerUserId: s.ownerUserId }),
  }
));

export function isBloomFlowerType(type: FlowerType) {
  return BLOOM_TYPES.includes(type);
}
