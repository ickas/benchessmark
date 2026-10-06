import type { Player } from './types.js';

/**
 * A uniform legal move. The floor: a model that does not clearly beat this is
 * not reading the board.
 */
export function makeRandomPlayer(): Player {
  return {
    info: {
      id: 'random',
      name: 'Random',
      maker: 'code',
      slug: 'uniform legal move',
      color: '#8b97a6',
      kind: 'random',
    },
    async decide({ legal, rng }) {
      return { move: rng.pick(legal), probabilities: {}, tieCount: 1 };
    },
  };
}
