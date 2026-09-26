/**
 * The game's dice. Seeded and saved with the game, so a loaded game rolls what
 * the saved one would have rolled and a test can replay a battle exactly.
 */

export class Rng {
  constructor(public state: number) {}

  /** A number in [0, 1). Mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** One die. */
  d6(): number {
    return 1 + Math.floor(this.next() * 6);
  }

  /** n dice, added up. */
  roll(n: number): number {
    let total = 0;
    for (let i = 0; i < n; i++) total += this.d6();
    return total;
  }

  /** Two dice, which is what Traveller rolls for nearly everything. */
  twoD(): number {
    return this.d6() + this.d6();
  }

  int(below: number): number {
    return Math.floor(this.next() * below);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}

/** A seed from a string, so a game can be named by one. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
