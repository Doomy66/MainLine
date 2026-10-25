/**
 * Seeded randomness. Nothing in generation may reach for Math.random, or the same
 * seed stops producing the same planet.
 */

/** String to 32-bit hash. */
export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small, fast, adequate for terrain. Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A value in [0, 1) fixed by the seed and an index, independent of the order in
 * which cells are visited. Generation depends on it so that changing the fill
 * order cannot change the planet.
 */
export function valueFor(seed: string, index: number): number {
  let h = hashString(seed) ^ Math.imul(index + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The same, mapped to [-1, 1). */
export function signedValueFor(seed: string, index: number): number {
  return valueFor(seed, index) * 2 - 1;
}
