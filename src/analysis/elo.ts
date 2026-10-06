import { mean, stdDev } from './stats.js';

export interface EloGap {
  /** Mean score of player A, 0..1. */
  score: number;
  elo: number;
  low: number;
  high: number;
  /** True when the 95% interval holds 0: the result is a tie. */
  tie: boolean;
}

/** Elo from a mean score. Infinite at 0 and 1. */
export const eloFromScore = (s: number) => -400 * Math.log10(1 / s - 1);

/**
 * The Elo gap of player A over player B, with a 95% interval.
 * scores: 1 win, 0.5 draw, 0 loss, for player A, one per game.
 * 100 games give approximately ±60 Elo near an even score.
 */
export function eloGap(scores: number[]): EloGap {
  const s = mean(scores);
  const se = stdDev(scores) / Math.sqrt(Math.max(scores.length, 1));
  const bound = (x: number) => eloFromScore(Math.min(Math.max(x, 1e-6), 1 - 1e-6));
  const low = bound(s - 1.96 * se);
  const high = bound(s + 1.96 * se);
  return { score: s, elo: eloFromScore(s), low, high, tie: low <= 0 && high >= 0 };
}
