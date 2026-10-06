import type { Chess, Move } from 'chess.js';
import type { CallFacts, PlayerInfo } from '../record/types.js';
import type { Rng } from '../rng.js';
import type { MoveRequest } from '../game/request.js';

export interface DecideInput {
  chess: Chess;
  legal: Move[];
  rng: Rng;
  /** Tags the call in the provider's logs, e.g. "g017/ply11". */
  label: string;
}

export interface Decision {
  move: Move;
  probabilities: Record<string, number>;
  confidence?: number;
  tieCount: number;
  call?: CallFacts;
}

/** The request a model player sends, as it goes on the wire. */
export interface WireRequest extends MoveRequest {
  model: string;
}

/** Transport settings that must be the same for both players. */
export interface TransportSettings {
  transport: string;
  timeoutMs: number;
  retries: number;
  minIntervalMs: number;
}

/**
 * Models and code players share this interface, so a baseline plays through
 * exactly the same game loop as a model.
 */
export interface Player {
  info: PlayerInfo;
  decide(input: DecideInput): Promise<Decision>;
  /** Model players only: the request for a position, for the setup check. */
  requestFor?(chess: Chess): WireRequest;
  /** Model players only. */
  transport?: TransportSettings;
  close?(): Promise<void>;
}
