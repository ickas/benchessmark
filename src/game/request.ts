import type { Chess, Move } from 'chess.js';
import type { ChoiceQuestion } from '../client/types.js';
import type { Setup } from '../setup.js';

/**
 * What the model sees each turn: the FEN, a text board and the move list.
 *
 * The text board is there because TypeSafe documents counting as a weak point
 * of jev-1.13, and a FEN rank like "n2Pp1N1" has to be counted to be read.
 * The rows spell every square out instead.
 */
export interface ChessState {
  game: 'chess';
  you_play: 'white' | 'black';
  fen: string;
  board: string[];
  legend: string;
  moves: string;
}

export interface MoveRequest {
  state: ChessState;
  questions: { move: ChoiceQuestion };
}

/**
 * Clef is served by Workers AI, which reads only roughly the first 2K tokens
 * of a text state (battleship-vs-jev, src/jev/openrouter.ts). A state past this
 * would be half-read by one model and fully read by the other.
 */
export const STATE_TOKEN_LIMIT = 1_500;

export function buildRequest(setup: Setup, chess: Chess, legal: Move[] = chess.moves({ verbose: true })): MoveRequest {
  const side = chess.turn() === 'w' ? 'white' : 'black';
  const criteria: Record<string, string> = {};
  // Key is UCI (letters and digits only), label is SAN. chess.js generates
  // moves in a fixed order, so both models see the same option order.
  for (const move of legal) criteria[move.lan] = move.san;

  return {
    state: buildState(chess),
    questions: {
      move: {
        type: 'choice',
        instructions: setup.instructions.replaceAll('{side}', side),
        criteria,
      },
    },
  };
}

export function buildState(chess: Chess): ChessState {
  return {
    game: 'chess',
    you_play: chess.turn() === 'w' ? 'white' : 'black',
    fen: chess.fen(),
    board: textBoard(chess),
    legend: 'uppercase is white, lowercase is black',
    moves: moveList(chess.history()),
  };
}

/** Eight rank rows, white at the bottom, then the file letters. */
export function textBoard(chess: Chess): string[] {
  const rows = chess.board().map((rank, i) => {
    const cells = rank.map((sq) => (sq ? (sq.color === 'w' ? sq.type.toUpperCase() : sq.type) : '.'));
    return `${8 - i} ${cells.join(' ')}`;
  });
  return [...rows, '  a b c d e f g h'];
}

/** ["e4", "e5", "Nf3"] → "1. e4 e5 2. Nf3" */
export function moveList(sans: string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
}

/**
 * A cautious token estimate: three characters a token. Real tokenizers do
 * better on this text, so the true count is lower than this.
 */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 3);
}

export function assertStateUnder(state: ChessState, limit = STATE_TOKEN_LIMIT): void {
  const tokens = estimateTokens(state);
  if (tokens > limit) {
    throw new Error(
      `The state is approximately ${tokens} tokens, over the ${limit} limit. ` +
        'Clef would read only part of it, so the turn is not sent.',
    );
  }
}
