import type { SavedFlower } from "@/stores/flowerStore";

export interface CreatedEvent {
  kind: "created";
  flowerId: string;
  title: string;
  /** YYYY-MM-DD (SavedFlower.createdAt) */
  date: string;
  /** The name it grew from, which says what kind of flower it is. */
  name: string;
}

export interface MintedEvent {
  kind: "minted";
  flowerId: string;
  title: string;
  /** Grouped under the flower's createdAt day — no separate mint timestamp exists. */
  date: string;
  txHash?: string;
}

export type ActivityEvent = CreatedEvent | MintedEvent;

export interface ActivityDay {
  date: string;
  events: ActivityEvent[];
}

/**
 * Builds a reverse-chronological timeline from savedFlowers only (no backend).
 * Days sort descending by ISO date string. Within a day, the most recently
 * saved flower appears first; a minted flower's "minted" event precedes its
 * "created" event because minting always happens after creation.
 */
export function buildActivityTimeline(savedFlowers: SavedFlower[]): ActivityDay[] {
  const byDate = new Map<string, ActivityEvent[]>();

  for (let i = savedFlowers.length - 1; i >= 0; i--) {
    const f = savedFlowers[i];
    if (!f.createdAt) continue;

    let bucket = byDate.get(f.createdAt);
    if (!bucket) {
      bucket = [];
      byDate.set(f.createdAt, bucket);
    }

    if (f.isMinted) {
      bucket.push({
        kind: "minted",
        flowerId: f.id,
        title: f.title,
        date: f.createdAt,
        txHash: f.txHash,
      });
    }

    bucket.push({
      kind: "created",
      flowerId: f.id,
      title: f.title,
      date: f.createdAt,
      name: f.generationWord,
    });
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, events]) => ({ date, events }));
}
