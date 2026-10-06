import type { Chess } from 'chess.js';
import type { MoveRecord } from '../record/types.js';
import type { Rng } from '../rng.js';
import type { Player } from '../players/types.js';

/**
 * One turn: the legal moves go to the player as its options, and the move it
 * picks is played. Returns the record of the move.
 */
export async function playTurn(chess: Chess, player: Player, rng: Rng, label: string): Promise<MoveRecord> {
  const legal = chess.moves({ verbose: true });
  const fenBefore = chess.fen();
  const ply = chess.history().length + 1;
  const side = chess.turn();

  // Clef refuses a choice with fewer than 2 options; Jev accepts 1. The same
  // rule for both: a forced move makes no call.
  if (legal.length === 1) {
    const move = chess.move(legal[0]!);
    return {
      ply, side, fenBefore, uci: move.lan, san: move.san, legal: 1,
      book: false, forced: true, probabilities: {}, tieCount: 1,
    };
  }

  const decision = await player.decide({ chess, legal, rng, label });
  const move = chess.move(decision.move);

  return {
    ply,
    side,
    fenBefore,
    uci: move.lan,
    san: move.san,
    legal: legal.length,
    book: false,
    forced: false,
    probabilities: decision.probabilities,
    ...(decision.confidence !== undefined ? { confidence: decision.confidence } : {}),
    tieCount: decision.tieCount,
    ...(decision.call ? { call: decision.call } : {}),
  };
}
