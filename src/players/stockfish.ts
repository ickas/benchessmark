import { Engine } from '../analysis/stockfish.js';
import type { Player } from './types.js';

/**
 * Stockfish held to a fixed Elo with UCI_LimitStrength. A fixed point on the
 * Elo scale: a model's score against it means the same thing in every run.
 * 1320 is the lowest level Stockfish offers.
 */
export async function makeStockfishPlayer(elo: number, movetimeMs = 100): Promise<Player> {
  const engine = await Engine.open({ options: { UCI_LimitStrength: true, UCI_Elo: elo } });

  return {
    info: {
      id: `stockfish-${elo}`,
      name: `Stockfish ${elo}`,
      maker: 'code',
      slug: `${engine.name}, UCI_Elo ${elo}, ${movetimeMs} ms a move`,
      color: '#c6d0db',
      kind: 'stockfish',
    },
    async decide({ chess, legal }) {
      const { bestUci } = await engine.analyse(chess.fen(), { movetime: movetimeMs });
      const move = legal.find((m) => m.lan === bestUci);
      if (!move) throw new Error(`Stockfish returned "${bestUci}", which is not a legal move`);
      return { move, probabilities: {}, tieCount: 1 };
    },
    close: () => engine.close(),
  };
}
