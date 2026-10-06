import { Chess } from 'chess.js';
import type { GameRecord } from '../record/types.js';
import { listGames, readGame, writeGame } from '../record/writer.js';
import { gradeMove } from './quality.js';
import { Engine, MATE_CP } from './stockfish.js';

export const DEFAULT_DEPTH = 18;

/**
 * Grades every move of a finished game with Stockfish at a fixed depth.
 * Each position is searched once: its score is the "after" of one move and
 * the "before" of the next.
 */
export async function gradeGame(record: GameRecord, engine: Engine, depth: number): Promise<GameRecord> {
  const chess = new Chess();
  for (const move of record.moves) chess.move(move.uci);
  const fens = [...record.moves.map((m) => m.fenBefore), chess.fen()];

  // White's point of view, so neighbouring positions compare directly.
  const whiteCp: number[] = [];
  const best: string[] = [];
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i]!;
    const final = i === fens.length - 1 ? finalScore(chess, record) : undefined;
    if (final !== undefined) {
      whiteCp.push(final);
      best.push('(none)');
      continue;
    }
    const a = await engine.analyse(fen, { depth });
    const sideToMove = fen.split(' ')[1];
    whiteCp.push(sideToMove === 'w' ? a.cp : -a.cp);
    best.push(a.bestUci);
  }

  record.moves.forEach((move, i) => {
    const sign = move.side === 'w' ? 1 : -1;
    move.grade = gradeMove(sign * whiteCp[i]!, sign * whiteCp[i + 1]!, move.uci, best[i]!);
  });
  record.engine = { name: engine.name, depth };
  return record;
}

/**
 * The score of a final position that needs no search, for white.
 * Mate and draws by rule have a known value; any other end (ply cap, error)
 * is searched like a normal position.
 */
function finalScore(chess: Chess, record: GameRecord): number | undefined {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE_CP : MATE_CP;
  if (record.termination && ['stalemate', 'threefold', 'insufficient', 'fifty-move'].includes(record.termination)) {
    return 0;
  }
  return undefined;
}

export interface GradeRunOptions {
  depth?: number;
  threads?: number;
  /** Grade again a game that has a grade. */
  force?: boolean;
  onGame?: (record: GameRecord) => void;
}

/** Grades every finished game in a run folder. */
export async function gradeRun(dir: string, options: GradeRunOptions = {}): Promise<number> {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const engine = await Engine.open({ threads: options.threads ?? 1 });
  let graded = 0;
  try {
    for (const path of listGames(dir)) {
      const record = readGame(path);
      if (!record.termination) continue;
      if (record.engine && !options.force) continue;
      writeGame(dir, await gradeGame(record, engine, depth));
      options.onGame?.(record);
      graded++;
    }
  } finally {
    await engine.close();
  }
  return graded;
}
