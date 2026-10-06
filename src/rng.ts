// Copied from battleship-vs-jev src/engine/rng.ts on 2026-10-06.
/**
 * Small deterministic PRNG (mulberry32). Seeded so benchmark runs and
 * self-play batches reproduce exactly from a recorded seed.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number) => Math.floor(next() * max);

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[int(items.length)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

/**
 * Samples an index from a probability distribution, with a temperature control.
 * temperature 0 → argmax; 1 → sample proportional to the given weights;
 * >1 → flatter, <1 → sharper. Used for self-play so two Jev instances with
 * identical state do not play identical games.
 */
export function sampleFromWeights(weights: number[], rng: Rng, temperature: number): number {
  if (weights.length === 0) throw new Error('Cannot sample from an empty distribution');
  if (temperature <= 0) {
    let best = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i]! > weights[best]!) best = i;
    return best;
  }

  const adjusted = weights.map((w) => Math.pow(Math.max(w, 0), 1 / temperature));
  const total = adjusted.reduce((sum, w) => sum + w, 0);
  // All-zero (or all-negative) weights: fall back to a uniform draw.
  if (total <= 0) return rng.int(weights.length);

  let threshold = rng.next() * total;
  for (let i = 0; i < adjusted.length; i++) {
    threshold -= adjusted[i]!;
    if (threshold <= 0) return i;
  }
  return adjusted.length - 1;
}
