import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { pickMove } from '../pick.js';
import { makeRng } from '../../rng.js';

const legal = () => new Chess().moves({ verbose: true });

describe('pickMove', () => {
  it('plays the most probable legal move', () => {
    const pick = pickMove({ type: 'choice', choice: 'd2d4', probabilities: { e2e4: 0.6, d2d4: 0.3 } }, legal(), makeRng(1));
    expect(pick.move.lan).toBe('e2e4');
    expect(pick.tieCount).toBe(1);
  });

  it('ignores the API choice field', () => {
    const pick = pickMove({ type: 'choice', choice: 'd2d4', probabilities: { e2e4: 0.51, d2d4: 0.49 } }, legal(), makeRng(1));
    expect(pick.move.lan).toBe('e2e4');
  });

  it('breaks a tie with the seeded draw, the same way for the same seed', () => {
    const answer = { type: 'choice' as const, choice: 'e2e4', probabilities: { e2e4: 0.41, d2d4: 0.41, c2c4: 0.18 } };
    const first = pickMove(answer, legal(), makeRng(7));
    const again = pickMove(answer, legal(), makeRng(7));
    expect(first.tieCount).toBe(2);
    expect(['e2e4', 'd2d4']).toContain(first.move.lan);
    expect(again.move.lan).toBe(first.move.lan);

    const seen = new Set(Array.from({ length: 40 }, (_, s) => pickMove(answer, legal(), makeRng(s)).move.lan));
    expect(seen).toEqual(new Set(['e2e4', 'd2d4']));
  });

  it('falls back to the choice when there are no probabilities', () => {
    const pick = pickMove({ type: 'choice', choice: 'g1f3' }, legal(), makeRng(1));
    expect(pick.move.lan).toBe('g1f3');
  });

  it('refuses an answer with no mass on any legal move, rather than play at random', () => {
    expect(() => pickMove({ type: 'choice', choice: 'Nf3', probabilities: { Nf3: 1 } }, legal(), makeRng(1))).toThrow(
      /no probability on any legal move/,
    );
  });
});
