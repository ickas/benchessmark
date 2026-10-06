// Copied from battleship-vs-jev src/jev/pricing.ts on 2026-10-06. Change it there first.
import type { JevUsage } from './types.js';

/**
 * Published rates, used only to estimate cost when the transport reports none.
 *
 * The Vercel AI Gateway returns a per-call `marketCost` and that figure is
 * always preferred. The TypeSafe API and Cloudflare Workers AI both return
 * token usage and no cost, so on those transports an estimate is the only
 * option, and showing nothing or a silent zero would be worse than showing a
 * clearly labelled estimate.
 *
 * Sources, all checked against the provider's own pricing page:
 *   jev        $0.042 /M input, output free  https://docs.typesafe.ai/models.md          (2026-09-19)
 *   clef       $0.240 /M input               https://developers.cloudflare.com/workers-ai/platform/pricing/ (2026-10-06)
 *   clef-flash $0.090 /M input               same page                                   (2026-10-06)
 *
 * The Jev rate is confirmed twice over: a live Gateway call reported marketCost
 * 0.000011424 for 272 input tokens, and 272 * 0.042 / 1e6 is exactly that.
 * Cloudflare bills in neurons (21,818 and 8,182 per M input tokens
 * respectively) and publishes the dollar equivalents above; the dollar figures
 * are used here. Re-check before trusting a large total: a provider can change
 * a price without changing an API.
 */
export interface ModelRate {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  source: string;
  confirmedOn: string;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  jev: {
    inputPerMillionUsd: 0.042,
    // Documented as free.
    outputPerMillionUsd: 0,
    source: 'https://docs.typesafe.ai/models.md',
    confirmedOn: '2026-09-19',
  },
  clef: {
    inputPerMillionUsd: 0.24,
    // Cloudflare publishes an input rate only for these models.
    outputPerMillionUsd: 0,
    source: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    confirmedOn: '2026-10-06',
  },
  'clef-flash': {
    inputPerMillionUsd: 0.09,
    outputPerMillionUsd: 0,
    source: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    confirmedOn: '2026-10-06',
  },
};

/** Kept for callers that predate the second backend. */
export const JEV_PRICING = {
  inputPerMillionUsd: MODEL_RATES.jev!.inputPerMillionUsd,
  outputPerMillionUsd: MODEL_RATES.jev!.outputPerMillionUsd,
  source: MODEL_RATES.jev!.source,
  confirmedOn: MODEL_RATES.jev!.confirmedOn,
} as const;

/**
 * Resolves a rate from a model id. Falls back to Jev's rate for anything
 * unrecognised, since that is the transport the unlabelled callers use.
 */
export function rateFor(model?: string): ModelRate {
  if (!model) return MODEL_RATES.jev!;
  const key = model.toLowerCase();
  if (key.includes('clef-flash')) return MODEL_RATES['clef-flash']!;
  if (key.includes('clef')) return MODEL_RATES.clef!;
  return MODEL_RATES.jev!;
}

/**
 * Cost of a call at the published rate, or undefined when usage is unknown.
 * An estimate, never a billed figure: callers must label it as one.
 */
export function estimateCostUsd(usage: JevUsage | undefined, model?: string): number | undefined {
  if (!usage) return undefined;
  const { inputTokens, outputTokens } = usage;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;

  const rate = rateFor(model);
  return (
    ((inputTokens ?? 0) * rate.inputPerMillionUsd) / 1e6 +
    ((outputTokens ?? 0) * rate.outputPerMillionUsd) / 1e6
  );
}

/** Formats a USD amount for display, keeping small figures legible. */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(5)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
