import { Chess } from 'chess.js';
import type { GameRecord, MoveRecord, Termination } from '../record/types.js';
import { makeRng } from '../rng.js';
import type { Player } from '../players/types.js';
import { playTurn } from './turn.js';

/** Ends a game by the rules of chess, or at the ply cap. */
export function termination(chess: Chess, plyCap: number): Termination | null {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isDrawByFiftyMoves()) return 'fifty-move';
  if (chess.history().length >= plyCap) return 'ply-cap'; // a draw, counted apart
  return null;
}

export function resultFor(t: Termination, chess: Chess): GameRecord['result'] {
  if (t === 'error') return '*';
  if (t === 'checkmate') return chess.turn() === 'w' ? '0-1' : '1-0';
  return '1/2-1/2';
}

/** Each game gets its own seed, so a rerun of one game reproduces it. */
export function gameSeed(seed: number, gameNo: number): number {
  return (Math.imul(seed, 1_000_003) + gameNo) >>> 0;
}

export interface PlayGameOptions {
  /** The record with everything but the moves filled in. */
  record: GameRecord;
  white: Player;
  black: Player;
  /** Called after every move, and once at the end. */
  onUpdate?: (record: GameRecord) => Promise<void> | void;
}

/**
 * Plays one game from its opening line to the end. A player error ends the
 * game as "error": the summary counts those apart from the score.
 */
export async function playGame({ record, white, black, onUpdate }: PlayGameOptions): Promise<GameRecord> {
  const chess = new Chess();
  const rng = makeRng(gameSeed(record.setup.seed, record.gameNo));
  const builds = { w: new Set<string>(), b: new Set<string>() };

  for (const uci of record.opening.uci) {
    const fenBefore = chess.fen();
    const legal = chess.moves().length;
    const side = chess.turn();
    const move = chess.move(uci);
    record.moves.push(bookMove(chess.history().length, side, fenBefore, move.lan, move.san, legal));
  }
  await onUpdate?.(record);

  for (;;) {
    const ended = termination(chess, record.setup.plyCap);
    if (ended) {
      record.termination = ended;
      record.result = resultFor(ended, chess);
      break;
    }

    const side = chess.turn();
    const player = side === 'w' ? white : black;
    try {
      const move = await playTurn(chess, player, rng, `${record.id}/ply${chess.history().length + 1}`);
      record.moves.push(move);
      if (move.call) {
        builds[side].add(move.call.build);
        (side === 'w' ? record.white : record.black).builds = [...builds[side]];
      }
    } catch (error) {
      record.termination = 'error';
      record.result = '*';
      record.error = error instanceof Error ? error.message : String(error);
      record.errorBy = side;
      break;
    }
    await onUpdate?.(record);
  }

  record.endedAt = new Date().toISOString();
  await onUpdate?.(record);
  return record;
}

function bookMove(ply: number, side: 'w' | 'b', fenBefore: string, uci: string, san: string, legal: number): MoveRecord {
  return { ply, side, fenBefore, uci, san, legal, book: true, forced: false, probabilities: {}, tieCount: 1 };
}
