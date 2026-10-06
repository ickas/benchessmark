import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING, frameAt, frameKey, makeSchedule, msForPos } from '../replay.js';

const book = { book: true, forced: false };
const chosen = { book: false, forced: false };
const timing = DEFAULT_TIMING; // move 1500, quick 500, slide 280, title 3000, end 4500

describe('the replay schedule', () => {
  const moves = [book, book, chosen, chosen];

  it('gives book moves a short slot and chosen moves a full one', () => {
    const s = makeSchedule(moves, timing, false);
    expect(s.starts).toEqual([0, 500, 1000, 2500]);
    expect(s.playEnd).toBe(4000);
    expect(s.total).toBe(4000);
  });

  it('adds the title and result cards only for the video', () => {
    const s = makeSchedule(moves, timing, true);
    expect(s.playStart).toBe(3000);
    expect(s.total).toBe(3000 + 4000 + 4500);
    expect(frameAt(0, s).phase).toBe('title');
    expect(frameAt(s.total - 1, s)).toMatchObject({ phase: 'end', pos: 4 });
  });

  it('thinks with arrows, slides, then holds on the new position', () => {
    const s = makeSchedule(moves, timing, false);
    // Move 3 (index 2) runs 1000–2500: hold 330, slide 280, think 890.
    expect(frameAt(1000, s)).toEqual({ phase: 'play', pos: 2, arrows: true, slide: null });
    expect(frameAt(1889, s).slide).toBeNull();
    expect(frameAt(1890, s)).toEqual({ phase: 'play', pos: 2, arrows: true, slide: { index: 2, t: 0 } });
    expect(frameAt(2030, s).slide?.t).toBeCloseTo(0.5, 5);
    expect(frameAt(2170, s)).toEqual({ phase: 'play', pos: 3, arrows: false, slide: null });
  });

  it('slides a book move at once, with no arrows', () => {
    const s = makeSchedule(moves, timing, false);
    expect(frameAt(100, s)).toMatchObject({ pos: 0, arrows: false, slide: { index: 0 } });
    expect(frameAt(300, s)).toMatchObject({ pos: 1, arrows: false, slide: null });
  });

  it('is a pure function of time: the same ms gives the same frame', () => {
    const s = makeSchedule(moves, timing, true);
    for (const ms of [0, 2999, 3000, 3600, 5100, 7000, 11_499]) {
      expect(frameKey(frameAt(ms, s))).toBe(frameKey(frameAt(ms, s)));
    }
    expect(frameKey(frameAt(3000, s))).not.toBe(frameKey(frameAt(3100, s)));
  });

  it('finds where the play button starts for a position', () => {
    const s = makeSchedule(moves, timing, false);
    expect(msForPos(2, s)).toBe(1000);
    expect(msForPos(4, s)).toBe(4000);
  });
});
