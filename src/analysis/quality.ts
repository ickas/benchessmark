import type { Grade, MoveRecord } from '../record/types.js';

/**
 * Move quality the way lichess measures it: through win chance rather than raw
 * centipawns, so a pawn thrown away at +8 costs less than a pawn at 0.
 * Constants from lichess (WinPercent.scala, AccuracyPercent.scala, Advice.scala).
 */

const CP_CEILING = 1_000;

export const clampCp = (cp: number) => Math.max(-CP_CEILING, Math.min(CP_CEILING, cp));

/** Win chance on a −1..1 scale, for the side the centipawns belong to. */
export const winChance = (cp: number) => 2 / (1 + Math.exp(-0.00368208 * clampCp(cp))) - 1;

/** The same on a 0..100 scale. */
export const winPct = (cp: number) => 50 + 50 * winChance(cp);

/** Accuracy of one move, 0–100, from the win % before and after it. */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winPctBefore - winPctAfter)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw));
}

/** Drop in win chance (−1..1 scale) for the side that moved. */
export function classify(drop: number): 'good' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (drop >= 0.3) return 'blunder';
  if (drop >= 0.2) return 'mistake';
  if (drop >= 0.1) return 'inaccuracy';
  return 'good';
}

/** Grades one move from the evaluations before and after, both for the mover. */
export function gradeMove(cpBefore: number, cpAfter: number, uci: string, bestUci: string): Grade {
  const drop = Math.max(0, winChance(cpBefore) - winChance(cpAfter));
  return {
    cpBefore,
    cpAfter,
    bestUci,
    cpLoss: Math.max(0, clampCp(cpBefore) - clampCp(cpAfter)),
    drop: round(drop, 4),
    accuracy: round(moveAccuracy(winPct(cpBefore), winPct(cpAfter)), 2),
    class: uci === bestUci ? 'best' : classify(drop),
  };
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * One player's accuracy over one game, the way lichess computes it: the mean
 * of a volatility-weighted mean and a harmonic mean of the move accuracies.
 * The harmonic mean is what keeps a lost game from reading as an accurate
 * one: once a position is lost, every move "loses nothing", but the few moves
 * that lost it pull a harmonic mean down hard.
 *
 * `moves` is the whole game in order, graded. `count` picks the moves that
 * belong to the player; all positions still set the weights.
 */
export function gameAccuracy(moves: MoveRecord[], count: (m: MoveRecord) => boolean): number | undefined {
  if (moves.length === 0 || moves.some((m) => !m.grade)) return undefined;

  const forWhite = (m: MoveRecord, cp: number) => winPct(m.side === 'w' ? cp : -cp);
  const wins = [...moves.map((m) => forWhite(m, m.grade!.cpBefore)), forWhite(moves.at(-1)!, moves.at(-1)!.grade!.cpAfter)];

  const size = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
  const windows = [
    ...Array.from({ length: Math.max(0, size - 2) }, () => wins.slice(0, size)),
    ...Array.from({ length: Math.max(0, wins.length - size + 1) }, (_, i) => wins.slice(i, i + size)),
  ];
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, populationSd(w))));

  const picked = moves.map((m, i) => ({ m, w: weights[i] ?? 0.5 })).filter(({ m }) => count(m));
  if (picked.length === 0) return undefined;

  const accs = picked.map(({ m }) => m.grade!.accuracy);
  const weighted = picked.reduce((s, { m, w }) => s + m.grade!.accuracy * w, 0) / picked.reduce((s, { w }) => s + w, 0);
  // Floored at 1 so one move at 0 does not zero the whole game.
  const harmonic = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return (weighted + harmonic) / 2;
}

function populationSd(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}
