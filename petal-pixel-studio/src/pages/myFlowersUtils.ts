import type { SavedFlower } from "@/stores/flowerStore";
import { kindOf } from "@/math/blossom/identity";

export type MintFilter = "all" | "minted" | "drafts";
export type SortOrder = "newest" | "oldest" | "name";

export interface FlowerFilters {
  search: string;
  /** "all" | "minted" | "drafts" */
  mint: MintFilter;
  /** "all" or a kind of flower, as returned by kindOf() */
  family: string;
}

/** The kinds of flower present in the collection, alphabetical. */
export function collectFamilies(flowers: SavedFlower[]): string[] {
  return [...new Set(flowers.map((f) => kindOf(f.generationWord)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function filterFlowers(flowers: SavedFlower[], filters: FlowerFilters): SavedFlower[] {
  const query = filters.search.trim().toLowerCase();
  return flowers.filter((f) => {
    if (
      query &&
      !f.title.toLowerCase().includes(query) &&
      !f.generationWord.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (filters.mint === "minted" && !f.isMinted) return false;
    if (filters.mint === "drafts" && f.isMinted) return false;
    if (filters.family !== "all" && kindOf(f.generationWord) !== filters.family) return false;
    return true;
  });
}

/**
 * Non-mutating sort. createdAt is a "YYYY-MM-DD" string (flowerStore saveFlower),
 * so lexicographic compare is chronologically correct; ties keep insertion order
 * (Array.prototype.sort is stable).
 */
export function sortFlowers(flowers: SavedFlower[], order: SortOrder): SavedFlower[] {
  const copy = [...flowers];
  switch (order) {
    case "newest":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "name":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }
}
