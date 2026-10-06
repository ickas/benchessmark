import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { playGame, termination } from '../play.js';
import { DEFAULT_SETUP } from '../../setup.js';
import type { GameRecord } from '../../record/types.js';
import type { Player } from '../../players/types.js';

function scripted(id: string, sans: string[]): Player {
  let i = 0;
  return {
    info: { id, name: id, maker: 'test', slug: id, color: '#fff', kind: 'random' },
    async decide({ legal }) {
      const san = sans[i++];
      const move = legal.find((m) => m.san === san);
      if (!move) throw new Error(`${id} has no move ${san}`);
      return { move, probabilities: { [move.lan]: 1 }, tieCount: 1 };
    },
  };
}

function failing(id: string): Player {
  return {
    info: { id, name: id, maker: 'test', slug: id, color: '#fff', kind: 'model' },
    async decide() {
      throw new Error('OpenRouter is out of credits (402)');
    },
  };
}

function blankRecord(uci: string[]): GameRecord {
  return {
    schema: 'benchessmark/game@1', id: 'g001', run: 'test', gameNo: 1,
    setup: DEFAULT_SETUP, setupHash: 'abc123', differences: [],
    white: { id: 'w', name: 'w', maker: 't', slug: 'w', color: '#fff', kind: 'random', builds: [] },
    black: { id: 'b', name: 'b', maker: 't', slug: 'b', color: '#fff', kind: 'random', builds: [] },
    opening: { eco: 'C20', name: 'test', pgn: '', uci },
    moves: [], result: '*', termination: null, startedAt: new Date().toISOString(),
    harness: { gitSha: 'none', chessJs: 'test', node: process.version },
  };
}

describe('playGame', () => {
  it('plays the book, then the players, and ends at checkmate', async () => {
    // Scholar's mate after the book line 1. e4 e5.
    const record = await playGame({
      record: blankRecord(['e2e4', 'e7e5']),
      white: scripted('w', ['Bc4', 'Qh5', 'Qxf7#']),
      black: scripted('b', ['Nc6', 'Nf6']),
    });
    expect(record.termination).toBe('checkmate');
    expect(record.result).toBe('1-0');
    expect(record.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
    expect(record.moves.filter((m) => m.book)).toHaveLength(2);
    expect(record.moves[2]).toMatchObject({ ply: 3, side: 'w', uci: 'f1c4', legal: 29, book: false });
  });

  it('ends the game as an error when a call fails, and says whose', async () => {
    const record = await playGame({ record: blankRecord(['e2e4']), white: scripted('w', []), black: failing('b') });
    expect(record.termination).toBe('error');
    expect(record.result).toBe('*');
    expect(record.errorBy).toBe('b');
    expect(record.error).toMatch(/402/);
  });

  it('writes after every move', async () => {
    const seen: number[] = [];
    await playGame({
      record: blankRecord(['e2e4', 'e7e5']),
      white: scripted('w', ['Bc4', 'Qh5', 'Qxf7#']),
      black: scripted('b', ['Nc6', 'Nf6']),
      onUpdate: (r) => void seen.push(r.moves.length),
    });
    expect(seen).toEqual([2, 3, 4, 5, 6, 7, 7]);
  });
});

describe('termination', () => {
  it('reads the rules of chess and the ply cap', () => {
    expect(termination(new Chess(), 300)).toBeNull();
    expect(termination(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 300)).toBe('stalemate');
    expect(termination(new Chess('8/8/8/8/8/8/8/K6k w - - 0 1'), 300)).toBe('insufficient');
    const chess = new Chess();
    chess.move('e4');
    expect(termination(chess, 1)).toBe('ply-cap');
  });
});
