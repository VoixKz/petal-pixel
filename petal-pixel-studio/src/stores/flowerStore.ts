import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ConnectError } from "@connectrpc/connect";
import {
  BLOOM_TYPES,
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  type BloomParams,
  type ClassicParams,
  type FlowerType,
  type RoseParams,
} from "@/math/flowerTypes";
import { toTechniqueParams } from "@/math/flowerGeometry";
import { createFlowerViaGrpc } from "@/integrations/flowerBackend/client";
import { supabase } from "@/integrations/supabase/client";

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
}

interface FlowerStore {
  params: FlowerParams;
  generationWord: string;
  title: string;
  editingFlowerId: string | null;
  savedFlowers: SavedFlower[];
  isGenerating: boolean;
  lastError: string;

  setParam: <K extends keyof FlowerParams>(key: K, value: FlowerParams[K]) => void;
  setFlowerType: (flowerType: FlowerType) => void;
  setClassicParam: <K extends keyof ClassicParams>(key: K, value: ClassicParams[K]) => void;
  setRoseParam: <K extends keyof RoseParams>(key: K, value: RoseParams[K]) => void;
  setBloomParam: <K extends keyof BloomParams>(key: K, value: BloomParams[K]) => void;

  setGenerationWord: (word: string) => void;
  setTitle: (title: string) => void;
  generateFromWord: (word: string) => Promise<void>;
  saveFlower: () => Promise<void>;
  updateFlowerTitle: (id: string, newTitle: string) => Promise<void>;
  deleteFlower: (id: string) => Promise<void>;
  loadFlowerForEdit: (flower: SavedFlower) => void;
  clearEditMode: () => void;
  mintFlower: (id: string) => void;
  markMintedByBackendFlowerId: (backendFlowerId: string, txHash?: string, tokenUri?: string) => Promise<boolean>;
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

function seedToDisplay(seed: bigint) {
  return seed.toString();
}

function generateAutoTitle(word: string, flowerType: FlowerType): string {
  const prefixes = ["Celestial", "Aurora", "Crystal", "Nebula", "Astral", "Phantom", "Luminous", "Ethereal"];
  const typeNames: Record<FlowerType, string> = {
    classic: "Bloom",
    rose: "Rose",
    zinnia: "Zinnia",
    camellia: "Camellia",
    lotus: "Lotus",
    dahlia: "Dahlia",
  };

  const hash = Array.from(word).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `${prefixes[hash % prefixes.length]} ${typeNames[flowerType]}`;
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
  colorA: "#10b981",
  colorB: "#2563eb",
  glowIntensity: 0.5,
  material: "metallic",
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
      const oldBackendId = existing?.backendFlowerId;
      const newBackendId = params.flowerId || oldBackendId;
      const regenerated = Boolean(newBackendId && newBackendId !== oldBackendId);

      const updated = savedFlowers.map((f) =>
        f.id === editingFlowerId
          ? {
              ...f,
              title,
              generationWord: generationWord || f.generationWord,
              params: { ...params },
              backendFlowerId: newBackendId || f.backendFlowerId,
            }
          : f,
      );
      set({ savedFlowers: updated });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (regenerated && newBackendId) {
          // Flower was re-generated with a new word → new backend ID
          await supabaseUpsertFlower(
            user.id,
            newBackendId,
            title,
            generationWord || existing?.generationWord || "unknown",
            params,
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
            generation_word: generationWord || existing?.generationWord,
            params,
          });
        }
      }
      return;
    }

    // ── Create path ───────────────────────────────────────────────────────────
    // Use the backend flower ID as the local id so all saves are idempotent.
    const newId = params.flowerId;
    if (!newId) return; // guard — should have been caught by handleSave already

    const newFlower: SavedFlower = {
      id: newId,
      backendFlowerId: newId,
      title,
      generationWord: generationWord || "unknown",
      params: { ...params },
      createdAt: new Date().toISOString().split("T")[0],
      isMinted: false,
    };

    // Avoid duplicate if the flower was already added (e.g. rapid double-click)
    const alreadyExists = savedFlowers.some(f => f.id === newId);
    if (!alreadyExists) {
      set({ savedFlowers: [...savedFlowers, newFlower], editingFlowerId: newId });
    } else {
      set({ editingFlowerId: newId });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabaseUpsertFlower(user.id, newId, title, generationWord || "unknown", params);
    }
  },

  updateFlowerTitle: async (id, newTitle) => {
    const { savedFlowers } = get();
    const updated = savedFlowers.map((f) =>
      f.id === id ? { ...f, title: newTitle } : f,
    );
    set({ savedFlowers: updated });

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

  markMintedByBackendFlowerId: async (backendFlowerId, txHash, tokenUri) => {
    // Optimistic local update
    set((s) => ({
      savedFlowers: s.savedFlowers.map((f) =>
        f.backendFlowerId === backendFlowerId
          ? { ...f, isMinted: true, txHash: txHash ?? f.txHash, tokenUri: tokenUri ?? f.tokenUri }
          : f,
      ),
    }));

    // Persist to Supabase; report failure to the caller instead of swallowing it.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return true; // nothing to sync (not signed in)

      const { error } = await supabase.from('user_flowers')
        .update({
          is_minted: true,
          tx_hash: txHash ?? null,
          token_uri: tokenUri ?? null,
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rows, error } = await supabase
        .from('user_flowers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('loadFromBackend error:', error);
        set({ savedFlowers: [] });
        return;
      }

      if (!rows?.length) {
        set({ savedFlowers: [] });
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
        }));

      set({ savedFlowers: mapped });
    } catch (err) {
      console.error('loadFromBackend failed:', err);
      set({ savedFlowers: [] });
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
    });
    useFlowerStore.persist.clearStorage();
  },
  }),
  {
    name: 'petal-pixel-flowers',
    // Keep savedFlowers in localStorage as a fast-load cache.
    // loadFromBackend always overwrites it with the authoritative Supabase data.
    partialize: (s) => ({ savedFlowers: s.savedFlowers }),
  }
));

export function isBloomFlowerType(type: FlowerType) {
  return BLOOM_TYPES.includes(type);
}
