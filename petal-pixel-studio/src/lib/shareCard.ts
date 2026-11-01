// Pure builders for per-network share intents + the downloadable card's
// caption/filename. No DOM, no imports, no globals — unit-tested in
// shareCard.test.ts so they stay byte-identical for the same inputs.
const enc = encodeURIComponent;

/** Single source of truth for the caption shared into both X/Telegram intents. */
export function shareCardText(personName: string): string {
  const name = personName.trim();
  return name ? `${name}'s flower, bloomed on Petal Pixel 🌸` : 'A flower bloomed on Petal Pixel 🌸';
}

/** `https://twitter.com/intent/tweet?text=<enc(text)>&url=<enc(shareUrl)>` */
export function buildTweetUrl(shareUrl: string, text: string): string {
  return `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(shareUrl)}`;
}

/** `https://t.me/share/url?url=<enc(shareUrl)>&text=<enc(text)>` */
export function buildTelegramUrl(shareUrl: string, text: string): string {
  return `https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(text)}`;
}

/**
 * Sanitized `"<name>-petal-pixel.png"`. Mirrors CreateFlower's
 * `[\\/:*?"<>|]` → `_` filename sanitize; falls back to `flower` when blank.
 */
export function shareCardFilename(personName: string): string {
  const safe = personName.trim().replace(/[\\/:*?"<>|]/g, '_') || 'flower';
  return `${safe}-petal-pixel.png`;
}
