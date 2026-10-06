import type { ModelEntry } from './setup.js';

/**
 * Every model a match can name. A new System One model on the OpenRouter
 * Decisions API needs one entry here and nothing else:
 *
 *   npm run match -- jev <id>
 *
 * A chat model (GPT, Claude) writes text rather than scoring options, so it
 * needs its own Player in src/players/, not an entry here.
 */
export const MODELS = {
  jev: {
    name: 'Jev',
    maker: 'TypeSafe',
    slug: 'typesafe/jev-1.13',
    color: '#5ad1b5',
  },
  clef: {
    name: 'Clef',
    maker: 'Cloudflare',
    slug: 'cloudflare/clef',
    color: '#f6821f',
  },
  'clef-flash': {
    name: 'Clef-flash',
    maker: 'Cloudflare',
    slug: 'cloudflare/clef-flash',
    color: '#f9b36b',
  },
} satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODELS;

export function isModelId(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id);
}
