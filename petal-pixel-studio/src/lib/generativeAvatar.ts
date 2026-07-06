/**
 * Deterministic generative avatar. Renders a small flower/petal SVG purely
 * from a seed string (typically display_name || email). No storage, no
 * randomness — same seed always yields byte-identical output. Used as the
 * default avatar everywhere `profile.avatar_url` is empty.
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hsl(hue: number, sat: number, light: number): string {
  return `hsl(${Math.round(((hue % 360) + 360) % 360)}, ${sat}%, ${light}%)`;
}

export function generativeAvatarSvg(seed: string, size = 64): string {
  const key = (seed ?? "").trim();
  const h = fnv1a(key || "petal");
  const baseHue = h % 360;
  const accentHue = baseHue + 40 + ((h >> 8) % 80); // 40–120° off base
  const bgHue = baseHue + 180; // complementary backdrop
  const symmetry = 5 + (h % 4); // 5–8 petals
  const petalLen = 15 + ((h >> 3) % 7); // 15–21 (within 64 box)

  const cx = 32;
  const cy = 32;
  const petals = Array.from({ length: symmetry }, (_, i) => {
    const angle = (360 / symmetry) * i;
    // Teardrop petal centered on +Y, rotated around the flower center.
    return (
      `<path d="M0 0 C 6 -${petalLen * 0.5}, 6 -${petalLen}, 0 -${petalLen} ` +
      `C -6 -${petalLen}, -6 -${petalLen * 0.5}, 0 0 Z" ` +
      `transform="translate(${cx} ${cy}) rotate(${angle})" ` +
      `fill="${i % 2 === 0 ? hsl(baseHue, 70, 60) : hsl(accentHue, 68, 55)}" ` +
      `fill-opacity="0.92"/>`
    );
  }).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ` +
    `width="${size}" height="${size}" role="img" aria-label="avatar">` +
    `<rect width="64" height="64" rx="12" fill="${hsl(bgHue, 30, 14)}"/>` +
    petals +
    `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${hsl(accentHue, 75, 68)}"/>` +
    `</svg>`
  );
}

export function generativeAvatarDataUri(seed: string, size = 64): string {
  return `data:image/svg+xml,${encodeURIComponent(generativeAvatarSvg(seed, size))}`;
}
