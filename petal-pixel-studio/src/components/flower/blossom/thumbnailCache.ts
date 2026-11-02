// Pictures of flowers already drawn on this device. Kept apart from the drawing itself,
// so a list can show what it has without loading any 3D code.

/** Raise this when flowers change shape, so old pictures are drawn again. */
const VERSION = 4;
const key = (seed: string) => `petal-thumb-${VERSION}-${seed.slice(0, 24)}`;
const session = new Map<string, string>();

export function thumbnailFor(seed: string): string | null {
  const known = session.get(seed);
  if (known) return known;
  try {
    const stored = localStorage.getItem(key(seed));
    if (stored) session.set(seed, stored);
    return stored;
  } catch {
    return null;
  }
}

export function rememberThumbnail(seed: string, picture: string): void {
  session.set(seed, picture);
  try {
    localStorage.setItem(key(seed), picture);
  } catch {
    /* A full or blocked store only means this one is drawn again next visit. */
  }
}
