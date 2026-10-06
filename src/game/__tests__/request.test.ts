import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { STATE_TOKEN_LIMIT, assertStateUnder, buildRequest, estimateTokens, moveList, textBoard } from '../request.js';
import { DEFAULT_SETUP } from '../../setup.js';

function twoKnights(): Chess {
  const chess = new Chess();
  for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5']) chess.move(m);
  return chess;
}

describe('buildRequest', () => {
  it('sends every legal move as an option, UCI key to SAN label', () => {
    const { questions } = buildRequest(DEFAULT_SETUP, twoKnights());
    const criteria = questions.move.criteria;
    expect(Object.keys(criteria)).toHaveLength(37);
    expect(criteria.c4b5).toBe('Bb5+');
    expect(criteria.d2d3).toBe('d3');
    expect(criteria.e1g1).toBe('O-O');
    for (const key of Object.keys(criteria)) expect(key).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  });

  it('names the side to move in the question', () => {
    const chess = twoKnights();
    expect(buildRequest(DEFAULT_SETUP, chess).questions.move.instructions).toBe(
      'Pick the best move for white in this position.',
    );
    chess.move('Bb5+');
    expect(buildRequest(DEFAULT_SETUP, chess).questions.move.instructions).toContain('for black');
  });

  it('holds the FEN, a text board and the move list', () => {
    const { state } = buildRequest(DEFAULT_SETUP, twoKnights());
    expect(state.fen).toBe('r1bqkb1r/ppp2ppp/5n2/n2Pp1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 1 6');
    expect(state.you_play).toBe('white');
    expect(state.board[3]).toBe('5 n . . P p . N .');
    expect(state.board[8]).toBe('  a b c d e f g h');
    expect(state.moves).toBe('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5');
  });

  it('is the same for any two players, so only the model differs', () => {
    expect(JSON.stringify(buildRequest(DEFAULT_SETUP, twoKnights()))).toBe(
      JSON.stringify(buildRequest(DEFAULT_SETUP, twoKnights())),
    );
  });
});

describe('the state size limit', () => {
  it('leaves a 300-ply game well under the limit', () => {
    const chess = new Chess();
    let i = 0;
    while (chess.history().length < 300 && !chess.isGameOver()) {
      const moves = chess.moves();
      chess.move(moves[(i++ * 7) % moves.length]!);
    }
    const { state } = buildRequest(DEFAULT_SETUP, chess);
    expect(estimateTokens(state)).toBeLessThan(STATE_TOKEN_LIMIT);
    expect(() => assertStateUnder(state)).not.toThrow();
  });

  it('refuses a state past the limit', () => {
    const { state } = buildRequest(DEFAULT_SETUP, new Chess());
    expect(() => assertStateUnder({ ...state, moves: 'x'.repeat(6_000) })).toThrow(/over the 1500 limit/);
  });
});

describe('helpers', () => {
  it('numbers the move list', () => {
    expect(moveList(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    expect(moveList([])).toBe('');
  });

  it('draws the start position with white at the bottom', () => {
    const rows = textBoard(new Chess());
    expect(rows[0]).toBe('8 r n b q k b n r');
    expect(rows[7]).toBe('1 R N B Q K B N R');
  });
});
