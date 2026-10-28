/** Seeded PRNG (mulberry32), local so the sample generators need no dependency (FR-4c, FR-43). */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks an item with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Normally distributed value (Box-Muller). */
  normal(mean: number, sd: number): number;
}

function hash(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function createRng(seed: string | number): Rng {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted(items, weight) {
      const total = items.reduce((s, i) => s + weight(i), 0);
      let r = next() * total;
      for (const item of items) {
        r -= weight(item);
        if (r < 0) return item;
      }
      return items[items.length - 1];
    },
    normal: (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
  return rng;
}
