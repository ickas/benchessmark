import type { Setup } from '../setup.js';

/**
 * One game, as one JSON file. The runner writes it after every move, the
 * grader adds a Stockfish grade to each move, and the viewer reads it.
 * Type-only: the viewer imports this file too.
 */
export interface GameRecord {
  schema: 'benchessmark/game@1';
  /** "g017" */
  id: string;
  /** The run folder name, e.g. "2026-10-06T18-40-jev-vs-clef". */
  run: string;
  gameNo: number;
  /** The full shared setup, copied in. */
  setup: Setup;
  /** Hash of the request both players get; "#3f9a2c" in the setup check. */
  setupHash: string;
  /** What no setting can make equal. See src/match/differences.ts. */
  differences: Difference[];
  white: PlayerRecord;
  black: PlayerRecord;
  opening: Opening;
  moves: MoveRecord[];
  /** "*" while the game runs, and for a game that ended in an error. */
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** null while the game runs. */
  termination: Termination | null;
  /** Set when termination is "error". */
  error?: string;
  /** Which side's call failed, when termination is "error". */
  errorBy?: Side;
  /** Set by the grader. */
  engine?: { name: string; depth: number };
  startedAt: string;
  endedAt?: string;
  harness: { gitSha: string; chessJs: string; node: string };
}

export type Side = 'w' | 'b';

export type Termination =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'fifty-move'
  | 'ply-cap'
  | 'error';

export type PlayerKind = 'model' | 'random' | 'stockfish';

export interface PlayerInfo {
  /** The id the CLI takes: "jev", "clef", "random", "stockfish-1320". */
  id: string;
  name: string;
  maker: string;
  /** What was asked for: an OpenRouter slug, or a description for code players. */
  slug: string;
  color: string;
  kind: PlayerKind;
}

export interface PlayerRecord extends PlayerInfo {
  /** The builds that answered, as the API reported them. */
  builds: string[];
}

export interface Opening {
  eco: string;
  name: string;
  pgn: string;
  uci: string[];
}

export interface Difference {
  what: string;
  white: string;
  black: string;
  effect: string;
}

export interface MoveRecord {
  /** 1 is white's first move. */
  ply: number;
  side: Side;
  fenBefore: string;
  uci: string;
  san: string;
  /** How many legal moves there were: the options sent. */
  legal: number;
  /** Played from the opening line, not by a player. */
  book: boolean;
  /** Only one legal move: played with no call. */
  forced: boolean;
  /** Every option, as returned. Empty for book, forced and code moves. */
  probabilities: Record<string, number>;
  confidence?: number;
  /** How many moves shared the top probability. 1 means no tie. */
  tieCount: number;
  call?: CallFacts;
  grade?: Grade;
}

export interface CallFacts {
  /** End to end, the successful attempt only. */
  ms: number;
  attempts: number;
  /** Time spent waiting between retries. Not part of ms. */
  retryWaitMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** True when costUsd came from the provider, not from a published rate. */
  costIsBilled: boolean;
  /** The build that answered, e.g. "typesafe/jev-1.13-20260917". */
  build: string;
  /** Provider request id, for the provider's logs. */
  id?: string;
}

export type GradeClass = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface Grade {
  /** Centipawns for the side that moved. Mate is ±(10000 − moves to mate). */
  cpBefore: number;
  cpAfter: number;
  /** Stockfish's move in the position before. */
  bestUci: string;
  /** Centipawns lost, each side clamped at ±1000. Never below 0. */
  cpLoss: number;
  /** Drop in win chance (−1..1 scale, as lichess). Never below 0. */
  drop: number;
  /** 0–100, from the lichess formula. */
  accuracy: number;
  class: GradeClass;
}
