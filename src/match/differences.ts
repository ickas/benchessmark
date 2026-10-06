import type { Difference, PlayerInfo } from '../record/types.js';

/**
 * What no setting removes. Each fact was measured in battleship-vs-jev
 * (docs/results-clef.md, src/jev/openrouter.ts) on 2026-10-06. The setup
 * check prints these, and each game record keeps a copy.
 */
interface ProviderFacts {
  decimals: string;
  build: string;
  stateLimit: string;
}

const FACTS: Record<string, ProviderFacts> = {
  typesafe: { decimals: '2', build: 'resolved build', stateLimit: '32k tokens' },
  cloudflare: { decimals: '4', build: 'alias only', stateLimit: '≈2k tokens' },
};

const EFFECTS = {
  decimals: 'Jev ties more often at the top. A seeded draw breaks ties.',
  build: 'A silent Clef update is not visible. Records keep the date.',
  stateLimit: 'The state must stay under 1,500 tokens. Each turn checks it.',
} as const;

function factsFor(player: PlayerInfo): ProviderFacts | undefined {
  if (player.kind !== 'model') return undefined;
  return FACTS[player.slug.split('/')[0] ?? ''];
}

/** The differences between two players, in the order the setup check prints them. */
export function knownDifferences(white: PlayerInfo, black: PlayerInfo): Difference[] {
  const a = factsFor(white);
  const b = factsFor(black);
  if (!a || !b) return [];

  return (['decimals', 'build', 'stateLimit'] as const).map((key) => ({
    what: { decimals: 'probability decimals', build: 'build reported', stateLimit: 'state read limit' }[key],
    white: a[key],
    black: b[key],
    effect: EFFECTS[key],
  }));
}
