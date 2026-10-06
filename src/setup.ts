/**
 * One setup. Both players get all of it.
 *
 * Fairness lives here rather than in the players: Jev and Clef have no effort,
 * temperature or seed setting, so the only way to treat them the same is to
 * send them the same request, through the same transport, and turn their
 * answers into moves by the same rule. A player entry (ModelEntry) names a
 * model and nothing else.
 */
export interface Setup {
  /** Both models go through one endpoint, so the network path is the same. */
  transport: 'openrouter';
  /** What the model sees each turn. See src/game/request.ts. */
  state: 'fen+board+moves';
  /** The question, word for word. `{side}` becomes "white" or "black". */
  instructions: string;
  /** Option key → label: the UCI move maps to its SAN. */
  options: 'uci→san';
  /** How a probability list becomes one move. See src/game/pick.ts. */
  pick: 'top, seeded tie';
  /** 50 lines; each is played once with each player as white. */
  openings: string;
  /** A game that reaches this many plies ends as a draw, counted apart. */
  plyCap: number;
  timeoutMs: number;
  /** Attempts after the first, for transient failures only. */
  retries: number;
  /** Minimum gap between requests. 0 means no pacing. */
  minIntervalMs: number;
  /** Seeds the tie breaks. Each game derives its own seed from this one. */
  seed: number;
}

export const DEFAULT_SETUP: Setup = {
  transport: 'openrouter',
  state: 'fen+board+moves',
  instructions: 'Pick the best move for {side} in this position.',
  options: 'uci→san',
  pick: 'top, seeded tie',
  openings: 'data/openings.json',
  plyCap: 300,
  timeoutMs: 60_000,
  retries: 5,
  minIntervalMs: 0,
  seed: 1,
};

/**
 * A player is a name and a model. Nothing else.
 * No effort, temperature or seed: neither API has one.
 */
export interface ModelEntry {
  name: string;
  maker: string;
  /** OpenRouter Decisions slug, e.g. "typesafe/jev-1.13". */
  slug: string;
  /** The accent colour in the viewer. */
  color: string;
}
