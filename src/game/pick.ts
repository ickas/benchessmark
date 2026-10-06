import type { Move } from 'chess.js';
import type { ChoiceAnswer } from '../client/types.js';
import type { Rng } from '../rng.js';

export interface Pick {
  move: Move;
  /** How many legal moves shared the top probability. */
  tieCount: number;
}

/**
 * Plays the most probable legal move. A seeded draw breaks a tie.
 *
 * The same rule for both models. The API's own `choice` field is not used:
 * how it breaks ties is not documented, and Jev rounds to two decimals, so
 * with 30-odd options two moves at the same top value is common.
 */
export function pickMove(answer: ChoiceAnswer, legal: Move[], rng: Rng): Pick {
  if (legal.length === 0) throw new Error('No legal moves to pick from');
  const p = answer.probabilities ?? { [answer.choice]: 1 };

  const top = Math.max(...legal.map((m) => p[m.lan] ?? 0));
  // No mass on any legal move means the answer did not use our option keys.
  // Drawing from every move then would quietly turn the model into a random
  // player, so it is an error instead.
  if (!(top > 0)) {
    throw new Error(`The answer puts no probability on any legal move (choice "${answer.choice}")`);
  }
  const tied = legal.filter((m) => (p[m.lan] ?? 0) === top);
  return { move: tied[rng.int(tied.length)]!, tieCount: tied.length };
}
