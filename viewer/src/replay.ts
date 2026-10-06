/**
 * The replay as a pure function of time. The same schedule drives the play
 * button and the video export: `frameAt(ms)` says exactly what the board
 * shows at any millisecond, with no clock involved, so a frame rendered for
 * the video is the same every time.
 */

export interface Timing {
  /** One move the player chose: think, slide, hold. */
  moveMs: number;
  /** One book or forced move: slide, hold. */
  quickMs: number;
  slideMs: number;
  /** Title card before the game and result card after it (video only). */
  titleMs: number;
  endMs: number;
}

export const DEFAULT_TIMING: Timing = {
  moveMs: 1500,
  quickMs: 500,
  slideMs: 280,
  titleMs: 3000,
  endMs: 4500,
};

export interface Frame {
  phase: 'title' | 'play' | 'end';
  /** Moves applied to the board. */
  pos: number;
  /** Show the candidate arrows of move `pos`. */
  arrows: boolean;
  /** Move `index` is sliding; t runs 0 → 1. */
  slide: { index: number; t: number } | null;
}

export interface Schedule {
  timing: Timing;
  starts: number[];
  durations: number[];
  quick: boolean[];
  playStart: number;
  playEnd: number;
  total: number;
}

export function makeSchedule(moves: { book: boolean; forced: boolean }[], timing: Timing, cards: boolean): Schedule {
  const playStart = cards ? timing.titleMs : 0;
  const starts: number[] = [];
  const durations: number[] = [];
  const quick: boolean[] = [];
  let t = playStart;
  for (const move of moves) {
    const isQuick = move.book || move.forced;
    starts.push(t);
    quick.push(isQuick);
    const d = isQuick ? timing.quickMs : timing.moveMs;
    durations.push(d);
    t += d;
  }
  return { timing, starts, durations, quick, playStart, playEnd: t, total: t + (cards ? timing.endMs : 0) };
}

export function frameAt(ms: number, s: Schedule): Frame {
  const n = s.starts.length;
  if (ms < s.playStart) return { phase: 'title', pos: 0, arrows: false, slide: null };
  if (ms >= s.playEnd) return { phase: s.total > s.playEnd ? 'end' : 'play', pos: n, arrows: false, slide: null };

  // The move whose segment holds `ms`.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.starts[mid]! <= ms) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const local = ms - s.starts[i]!;
  const { slideMs } = s.timing;

  if (s.quick[i]) {
    if (local < slideMs) return { phase: 'play', pos: i, arrows: false, slide: { index: i, t: local / slideMs } };
    return { phase: 'play', pos: i + 1, arrows: false, slide: null };
  }

  // Think, then slide, then hold on the new position.
  const hold = Math.round(s.durations[i]! * 0.22);
  const think = s.durations[i]! - slideMs - hold;
  if (local < think) return { phase: 'play', pos: i, arrows: true, slide: null };
  if (local < think + slideMs) return { phase: 'play', pos: i, arrows: true, slide: { index: i, t: (local - think) / slideMs } };
  return { phase: 'play', pos: i + 1, arrows: false, slide: null };
}

/** Equal keys mean equal pictures, so the export can reuse a screenshot. */
export function frameKey(f: Frame): string {
  return `${f.phase}:${f.pos}:${f.arrows ? 1 : 0}:${f.slide ? `${f.slide.index}@${f.slide.t.toFixed(3)}` : '-'}`;
}

/** Where a frame of the play button starts for a board position. */
export function msForPos(pos: number, s: Schedule): number {
  if (pos >= s.starts.length) return s.playEnd;
  return s.starts[pos]!;
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
