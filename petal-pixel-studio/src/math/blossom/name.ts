/** The same rule as the backend: capitals and extra spaces don't change a name. */
export const cleanName = (name: string) => name.trim().split(/\s+/).join(" ").toLowerCase();

const ROUNDS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * SHA-256, written out. The browser's own is asynchronous and missing outside
 * https, and a flower's kind and colours are read while a list is being drawn.
 */
function sha256(text: string): string {
  const message = new TextEncoder().encode(text);
  const blocks = Math.ceil((message.length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, message.length * 8);
  const view = new DataView(padded.buffer);

  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let block = 0; block < blocks; block += 1) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block * 64 + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = rotate(w[i - 15], 7) ^ rotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const b = rotate(w[i - 2], 17) ^ rotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + a + w[i - 7] + b) | 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const big = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + big + choice + ROUNDS[i] + w[i]) | 0;
      const small = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const major = (a & b) ^ (a & c) ^ (b & c);
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + first) | 0, c, b, a, (first + small + major) | 0];
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      hash[i] = (hash[i] + value) | 0;
    });
  }
  return hash.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

/** A name's SHA-256. Everything about its flower is read from this. */
export const seedOf = (name: string) => sha256(cleanName(name));
