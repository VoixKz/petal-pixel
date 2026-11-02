import type { SavedFlower } from "@/stores/flowerStore";
import { kindOf } from "@/math/blossom/identity";

export interface FamilyCount {
  /** The kind of flower, as returned by kindOf(). */
  family: string;
  count: number;
}

/** Count flowers per kind, sorted by count desc then kind asc for a stable bar order. */
export function familyDistribution(savedFlowers: SavedFlower[]): FamilyCount[] {
  const counts = new Map<string, number>();
  for (const flower of savedFlowers) {
    const family = kindOf(flower.generationWord);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

/**
 * Newest `n` flowers by createdAt ("YYYY-MM-DD" — lexicographic == chronological).
 * Non-mutating; Array.prototype.sort is stable, so same-day flowers keep store order.
 */
export function recentFlowers(savedFlowers: SavedFlower[], n = 4): SavedFlower[] {
  return [...savedFlowers]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}
