import type { Chess } from 'chess.js';
import { OpenRouterClient } from '../client/openrouter.js';
import type { ChoiceAnswer, JevClient, JevResponse } from '../client/types.js';
import { assertStateUnder, buildRequest } from '../game/request.js';
import { pickMove } from '../game/pick.js';
import type { ModelEntry, Setup } from '../setup.js';
import type { CallFacts } from '../record/types.js';
import type { Decision, DecideInput, Player } from './types.js';

export interface ModelPlayerOptions {
  /** Groups a run in OpenRouter's own logs. */
  sessionId?: string;
  /** Injected in tests, so no network call is made. */
  client?: JevClient;
}

/**
 * A System One model on the OpenRouter Decisions API. Every model player is
 * built by this one function from the one shared setup, so the only thing
 * that differs between two of them is `entry.slug`.
 */
export function makeModelPlayer(
  id: string,
  entry: ModelEntry,
  setup: Setup,
  options: ModelPlayerOptions = {},
): Player {
  const client =
    options.client ??
    new OpenRouterClient({
      model: entry.slug,
      timeoutMs: setup.timeoutMs,
      retries: setup.retries,
      minIntervalMs: setup.minIntervalMs,
      // The game record keeps every call; the client's own log is not needed.
      keepFullLog: false,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    });

  return {
    info: { id, ...entry, kind: 'model' },
    transport: {
      transport: setup.transport,
      timeoutMs: setup.timeoutMs,
      retries: setup.retries,
      minIntervalMs: setup.minIntervalMs,
    },

    requestFor(chess: Chess) {
      return { model: entry.slug, ...buildRequest(setup, chess) };
    },

    async decide({ chess, legal, rng, label }: DecideInput): Promise<Decision> {
      const request = buildRequest(setup, chess, legal);
      assertStateUnder(request.state);

      const res = await client.ask({ state: request.state, questions: request.questions, label });
      const answer = res.answers.move;
      if (!answer || answer.type !== 'choice') {
        throw new Error(`${entry.name} returned no choice answer for the move question`);
      }

      const pick = pickMove(answer as ChoiceAnswer, legal, rng);
      return {
        move: pick.move,
        probabilities: (answer as ChoiceAnswer).probabilities ?? {},
        confidence: res.confidence.move,
        tieCount: pick.tieCount,
        call: callFacts(res),
      };
    },
  };
}

export function callFacts(res: JevResponse): CallFacts {
  const billed = res.billedCostUsd !== undefined;
  const cost = res.billedCostUsd ?? res.estimatedCostUsd;
  return {
    ms: Math.round(res.latencyMs),
    attempts: res.attempts ?? 1,
    retryWaitMs: res.retryWaitMs ?? 0,
    ...(res.usage.inputTokens !== undefined ? { inputTokens: res.usage.inputTokens } : {}),
    ...(res.usage.outputTokens !== undefined ? { outputTokens: res.usage.outputTokens } : {}),
    ...(cost !== undefined ? { costUsd: cost } : {}),
    costIsBilled: billed,
    build: res.modelId,
    ...(res.generationId ? { id: res.generationId } : {}),
  };
}
