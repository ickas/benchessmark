import { describe, expect, it } from 'vitest';
import { classify, gameAccuracy, gradeMove, moveAccuracy, winChance, winPct } from '../quality.js';
import { eloFromScore, eloGap } from '../elo.js';
import { mateToCp, parseSearch } from '../stockfish.js';
import { calibration } from '../summary.js';
import type { MoveRecord } from '../../record/types.js';

describe('quality', () => {
  it('maps centipawns to win chance as lichess does', () => {
    expect(winChance(0)).toBe(0);
    expect(winPct(0)).toBe(50);
    expect(winChance(1_000)).toBeCloseTo(0.9509, 3);
    // Clamped at ±1000: a mate counts no more than +10.
    expect(winChance(10_000)).toBe(winChance(1_000));
    expect(winChance(-300)).toBeCloseTo(-winChance(300), 10);
  });

  it('gives 100 accuracy for a move that loses nothing', () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 3);
    expect(moveAccuracy(60, 70)).toBe(100);
    expect(moveAccuracy(80, 20)).toBeLessThan(10);
  });

  it('classifies by the drop in win chance', () => {
    expect(classify(0.05)).toBe('good');
    expect(classify(0.1)).toBe('inaccuracy');
    expect(classify(0.2)).toBe('mistake');
    expect(classify(0.3)).toBe('blunder');
  });

  it('costs a pawn less when the game is already won', () => {
    const even = gradeMove(0, -100, 'a2a3', 'e2e4');
    const won = gradeMove(800, 700, 'a2a3', 'e2e4');
    expect(even.cpLoss).toBe(won.cpLoss);
    expect(won.drop).toBeLessThan(even.drop);
  });

  it('marks the Stockfish move as best', () => {
    expect(gradeMove(20, 15, 'e2e4', 'e2e4').class).toBe('best');
    expect(gradeMove(20, -900, 'g2g4', 'e2e4').class).toBe('blunder');
  });
});

describe('game accuracy', () => {
  const move = (side: 'w' | 'b', cpBefore: number, cpAfter: number): MoveRecord => ({
    ply: 1, side, fenBefore: '', uci: 'a2a3', san: '', legal: 20, book: false, forced: false, probabilities: {}, tieCount: 1,
    grade: gradeMove(cpBefore, cpAfter, 'a2a3', 'e2e4'),
  });

  it('does not let a lost game read as accurate', () => {
    // White throws the game away in one move, then "loses nothing" for 19 moves.
    const moves: MoveRecord[] = [move('w', 0, -900), move('b', 900, 900)];
    for (let i = 0; i < 19; i++) moves.push(move('w', -900, -900), move('b', 900, 900));
    const perMove = moves.filter((m) => m.side === 'w').map((m) => m.grade!.accuracy);
    const meanPerMove = perMove.reduce((s, a) => s + a, 0) / perMove.length;
    const game = gameAccuracy(moves, (m) => m.side === 'w')!;
    expect(meanPerMove).toBeGreaterThan(90);
    expect(game).toBeLessThan(70);
  });

  it('is undefined until the game is graded', () => {
    expect(gameAccuracy([{ ...move('w', 0, 0), grade: undefined }], () => true)).toBeUndefined();
  });
});

describe('elo', () => {
  it('turns a 54.5% score into about +31', () => {
    expect(eloFromScore(0.545)).toBeCloseTo(31.4, 1);
    expect(eloFromScore(0.5)).toBeCloseTo(0, 10);
  });

  it('gives an interval that holds 0 for a close result', () => {
    const scores = [...Array(41).fill(1), ...Array(27).fill(0.5), ...Array(32).fill(0)];
    const gap = eloGap(scores);
    expect(gap.elo).toBeCloseTo(31.4, 0);
    expect(gap.low).toBeLessThan(0);
    expect(gap.high).toBeGreaterThan(80);
    expect(gap.tie).toBe(true);
  });

  it('is not a tie for a clear result', () => {
    const gap = eloGap([...Array(80).fill(1), ...Array(20).fill(0)]);
    expect(gap.tie).toBe(false);
    expect(gap.low).toBeGreaterThan(0);
  });
});

describe('stockfish output', () => {
  it('reads the last full score and the best move', () => {
    const a = parseSearch([
      'info depth 1 seldepth 1 multipv 1 score cp 12 nodes 20 pv e2e4',
      'info depth 18 seldepth 24 multipv 1 score cp 41 lowerbound nodes 900 pv d2d4',
      'info depth 18 seldepth 24 multipv 1 score cp 34 nodes 1000 pv e2e4 e7e5',
      'bestmove e2e4 ponder e7e5',
    ]);
    expect(a).toEqual({ cp: 34, bestUci: 'e2e4', depth: 18 });
  });

  it('turns mate scores into large centipawn values', () => {
    expect(parseSearch(['info depth 9 score mate 3 pv h5f7', 'bestmove h5f7']).cp).toBe(9_997);
    expect(mateToCp(-2)).toBe(-9_998);
    expect(mateToCp(0)).toBe(-10_000);
  });
});

describe('calibration', () => {
  it('bins moves by confidence', () => {
    const move = (confidence: number, best: boolean): MoveRecord => ({
      ply: 1, side: 'w', fenBefore: '', uci: best ? 'e2e4' : 'a2a3', san: '', legal: 20, book: false, forced: false,
      probabilities: { e2e4: confidence }, confidence, tieCount: 1,
      grade: { cpBefore: 0, cpAfter: 0, bestUci: 'e2e4', cpLoss: 0, drop: best ? 0 : 0.2, accuracy: 100, class: best ? 'best' : 'mistake' },
    });
    const bins = calibration([move(0.1, false), move(0.15, false), move(0.9, true), move(1, true)]);
    expect(bins).toHaveLength(5);
    expect(bins[0]).toMatchObject({ n: 2, bestRate: 0, meanDrop: 0.2 });
    expect(bins[4]).toMatchObject({ n: 2, bestRate: 1 });
  });
});
