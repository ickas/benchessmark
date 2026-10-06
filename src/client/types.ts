// Copied from battleship-vs-jev src/jev/types.ts on 2026-10-06. Change it there first.
/**
 * The only interface through which the rest of the app talks to Jev.
 * Mirrors the AI SDK's evaluation shape (`boolean` | `choice` | `score`), which
 * is what the Gateway exposes. TypeSafe's own docs call `boolean` a "Noul".
 */

export interface BooleanQuestion {
  type: 'boolean';
  instructions: string;
  /** Optional definitions of what the true and false cases mean. */
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Option name → description. Jev allows at most 255 options per Choice. */
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  /** At least two ordered labels, lowest first. */
  criteria: string[];
}

export type JevQuestion = BooleanQuestion | ChoiceQuestion | ScoreQuestion;

export interface BooleanAnswer {
  type: 'boolean';
  probability: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  /**
   * Per-option distribution. Optional in the AI SDK's own types, so callers
   * must cope with it being absent rather than assume a heatmap is available.
   */
  probabilities?: Record<string, number>;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  probabilities?: Record<string, number>;
}

export type JevAnswer = BooleanAnswer | ChoiceAnswer | ScoreAnswer;

export interface JevRequest {
  /** Shared state all questions are asked against. String, object or array. */
  state: unknown;
  /** Questions are evaluated in parallel and independently of each other. */
  questions: Record<string, JevQuestion>;
  /** Tag recorded in the call log, so logs can be traced back to a game phase. */
  label?: string;
  abortSignal?: AbortSignal;
}

export interface JevUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface JevResponse {
  answers: Record<string, JevAnswer>;
  /** Per-question confidence, where the provider reported one. */
  confidence: Record<string, number>;
  usage: JevUsage;
  /**
   * The model id the Gateway reports. Note this is the alias that was
   * requested (`typesafe-ai/jev`), not a resolved version number: the Gateway
   * does not expose which Jev build answered. See docs/representation.md.
   */
  modelId: string;
  /** Gateway generation id, for cross-checking a call against the Gateway logs. */
  generationId?: string;
  /**
   * What the call would cost at list price, in USD, as reported by the Gateway
   * (`marketCost`). Read from the response rather than computed here, so no
   * price is hardcoded.
   */
  marketCostUsd?: number;
  /** What the call was actually billed, in USD (`cost`). */
  billedCostUsd?: number;
  /**
   * Cost at the published rate, set only when the transport reports no cost of
   * its own (the TypeSafe API does not). An estimate, not a billed figure.
   */
  estimatedCostUsd?: number;
  /**
   * End-to-end latency of the successful attempt, measured by the client and
   * including Gateway overhead. Excludes any client-side backoff waiting,
   * which is reported separately as `retryWaitMs`.
   */
  latencyMs: number;
  /** How many attempts this call took. 1 means it succeeded first time. */
  attempts?: number;
  /** Time spent sleeping between rate-limit retries, in milliseconds. */
  retryWaitMs?: number;
  warnings?: string[];
  /** Decimal precision the provider rounded to, when reported. */
  rounding?: { probabilityDecimals?: number; scoreDecimals?: number };
}

/** A complete record of one call, for the metrics panel and the bench logs. */
export interface JevCallLog {
  label: string;
  state: unknown;
  questions: Record<string, JevQuestion>;
  response?: JevResponse;
  error?: string;
  latencyMs: number;
  startedAt: string;
}

export interface JevClient {
  /** Sends one request. Multiple questions in one call are answered in parallel. */
  ask(request: JevRequest): Promise<JevResponse>;
  /** Every call made so far, oldest first. */
  readonly log: readonly JevCallLog[];
  readonly stats: {
    calls: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    /** Gateway round-trip time only, excluding client-side backoff. */
    totalLatencyMs: number;
    /** Time spent sleeping between rate-limit retries. */
    retryWaitMs?: number;
  };
}
