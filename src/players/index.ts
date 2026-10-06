import { MODELS, isModelId } from '../models.js';
import type { Setup } from '../setup.js';
import { makeModelPlayer } from './model.js';
import { makeRandomPlayer } from './random.js';
import { makeStockfishPlayer } from './stockfish.js';
import type { Player } from './types.js';

/** The ids the CLI takes: a key of MODELS, "random", or "stockfish-<elo>". */
export async function resolvePlayer(id: string, setup: Setup, sessionId?: string): Promise<Player> {
  if (isModelId(id)) return makeModelPlayer(id, MODELS[id], setup, sessionId ? { sessionId } : {});
  if (id === 'random') return makeRandomPlayer();

  const sf = id.match(/^stockfish-(\d+)$/);
  if (sf) return makeStockfishPlayer(Number(sf[1]));

  throw new Error(
    `Unknown player "${id}". Use one of: ${Object.keys(MODELS).join(', ')}, random, stockfish-<elo>.`,
  );
}
