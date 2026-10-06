// Copied from battleship-vs-jev src/jev/openrouter.ts on 2026-10-06. Change it there first.
import type {
  JevAnswer,
  JevCallLog,
  JevClient,
  JevRequest,
  JevResponse,
} from './types.js';
import { fromSystemOneAnswers, toSystemOneQuestions } from './systemOne.js';

/**
 * The OpenRouter Decisions API, which serves Jev and both Clef models behind
 * one transport.
 *
 * This exists because it is the only route that puts every model in this
 * benchmark on an identical network path. Comparing Jev reached through the
 * Vercel Gateway against Clef reached through Workers AI would confound the
 * model with its transport, and latency is one of the things being measured.
 *
 * Differences from the other two transports, all verified against the
 * published OpenAPI document on 2026-10-06
 * (https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request.md):
 *
 *   - One bearer key, rather than Cloudflare's account id in the path plus a
 *     token, or the Gateway's own credential.
 *   - No response envelope. Workers AI wraps the answers in
 *     {result, success, errors, messages}; here `answers` sits at the top
 *     level and failures come back as {error: {code, message}}.
 *   - `usage.cost` is the real billed figure. Workers AI returns no cost at
 *     all, which is why ClefClient can only ever report an estimate against a
 *     hardcoded rate. Anything this client reports as cost was measured.
 *   - `model` echoes a fully resolved build, e.g. `typesafe/jev-1.13-20260917`.
 *     The Gateway only ever returned an alias, which is why the earlier runs
 *     could not record which Jev answered.
 *   - The model slug is the full namespaced name in the body. Workers AI wants
 *     the bare name in the body and the slug in the URL; here there is one
 *     spelling and it goes in the body.
 *
 * The question and answer shapes are the same System One shapes Jev uses, so
 * the translation is shared verbatim (see systemOne.ts).
 */

/**
 * Slugs are passed through as given so a new model needs no code change. The
 * union documents the three this benchmark uses.
 */
export type OpenRouterDecisionModel =
  | 'typesafe/jev-1.13'
  | 'cloudflare/clef'
  | 'cloudflare/clef-flash'
  | (string & {});

/**
 * Clef is served by Workers AI, which truncates long text state to roughly the
 * first 2K tokens. That limit is a property of the serving stack rather than of
 * the Decisions API, so it applies to Clef through OpenRouter as well.
 *
 * This matters for the benchmark rather than for the client: a state that
 * crosses it is silently half-read, and a model player reading half a board
 * would be measured as a worse player rather than as a truncated one. Probed
 * empirically by scripts/probe-state-truncation.mts; do not treat the number as
 * exact.
 */
export const WORKERS_AI_STATE_TOKEN_LIMIT = 2_000;

/** Models whose serving stack imposes the truncation above. */
export function isWorkersAiServed(model: string): boolean {
  return model.startsWith('cloudflare/');
}

/** Carries the HTTP status so retry decisions never have to parse a message. */
export class DecisionsHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** From a Retry-After header, when the server sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DecisionsHttpError';
  }
}

/**
 * Retry-After is either seconds or an HTTP date. Returns undefined when absent
 * or unparseable, so the caller falls back to its own backoff.
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

/**
 * Statuses worth trying again.
 *
 * 529 is here because the truncation probe drew one on 20 Clef calls: Workers
 * AI returned `AiError: Clef inference failed`, which is transient and
 * model-side rather than anything wrong with the request. At that rate a
 * 60-game jevPure run of roughly 5,000 calls would hit it a few hundred times,
 * so a run without retry would be measuring Cloudflare's error rate as if it
 * were the model's judgement.
 *
 * 402 is deliberately absent: out of credits is not transient, and retrying it
 * just burns the clock.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 524, 529]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Whether a thrown error is worth another attempt.
 *
 * Status codes are only part of it. The first four-run benchmark lost four
 * games to `The operation was aborted due to timeout` and one `fetch failed`,
 * neither of which carries an HTTP status, so neither was retried and each took
 * a whole game down with it. That turned two 60-game runs into 58-game runs and
 * cost the pairing.
 *
 * A caller-initiated abort is deliberate and must never be retried, which is
 * why the caller's signal is checked before the error is classified.
 */
export function isRetryableError(error: unknown, callerAborted: boolean): boolean {
  if (callerAborted) return false;
  if (error instanceof DecisionsHttpError) return isRetryableStatus(error.status);

  // The request timeout surfaces as TimeoutError, or as AbortError on older
  // runtimes. Both mean the attempt stalled rather than that it was refused.
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return true;

  // undici reports a dropped connection or DNS failure as a plain TypeError
  // with the message `fetch failed`, with the detail on `cause`.
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) return true;

  return false;
}

export interface OpenRouterClientOptions {
  model?: OpenRouterDecisionModel;
  apiKey?: string;
  /** Overridable so tests never reach the network. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** Groups a benchmark run in OpenRouter's own logs. Never sent to the provider. */
  sessionId?: string;
  keepFullLog?: boolean;
  maxLogEntries?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Attempts after the first, for transient failures. */
  retries?: number;
  /** First backoff step; doubles per attempt. */
  backoffMs?: number;
  /**
   * First backoff step for a 429. Separate because Cloudflare's limit is
   * "inference requests per minute": a 0.5s step exhausts every retry inside
   * four seconds and the game dies while the window has barely moved. A
   * 60-game jevPure run lost 21 games that way.
   */
  rateLimitBackoffMs?: number;
  onCall?: (log: JevCallLog) => void;
}

export class OpenRouterClient implements JevClient {
  readonly model: OpenRouterDecisionModel;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly sessionId?: string;
  private readonly keepFullLog: boolean;
  private readonly maxLogEntries: number;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly rateLimitBackoffMs: number;
  private readonly onCall?: (log: JevCallLog) => void;
  private readonly calls: JevCallLog[] = [];

  private pacingChain: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  readonly stats = {
    calls: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalLatencyMs: 0,
    retryWaitMs: 0,
    /** Summed from `usage.cost`, so this is billed rather than estimated. */
    billedCostUsd: 0,
  };

  constructor(options: OpenRouterClientOptions = {}) {
    this.model = options.model ?? 'cloudflare/clef';
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';

    if (!options.fetchImpl && !this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY must be set to call the Decisions API. ' +
          'Create one at https://openrouter.ai/keys.',
      );
    }

    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/alpha/decisions';
    this.sessionId = options.sessionId;
    this.keepFullLog = options.keepFullLog ?? true;
    this.maxLogEntries = options.maxLogEntries ?? 500;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.retries = options.retries ?? 5;
    this.backoffMs = options.backoffMs ?? 500;
    this.rateLimitBackoffMs = options.rateLimitBackoffMs ?? 8_000;
    this.onCall = options.onCall;
  }

  get log(): readonly JevCallLog[] {
    return this.calls;
  }

  async ask(request: JevRequest): Promise<JevResponse> {
    if (Object.keys(request.questions).length === 0) {
      throw new Error('A Decisions request needs at least one question');
    }

    await this.pace(request.abortSignal);

    const startedAt = new Date().toISOString();
    const start = performance.now();

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        state: request.state ?? null,
        questions: toSystemOneQuestions(request.questions),
      };
      if (this.sessionId) body.session_id = this.sessionId;

      const { payload, latencyMs, attempts, retryWaitMs } = await this.withRetry(
        request.abortSignal,
        async () => {
          const timeout = AbortSignal.timeout(this.timeoutMs);
          const signal = request.abortSignal
            ? AbortSignal.any([request.abortSignal, timeout])
            : timeout;

          const res = await this.fetchImpl(this.baseUrl, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
          });

          const parsed = (await res.json()) as Record<string, unknown>;
          if (!res.ok) {
            throw new DecisionsHttpError(
              res.status,
              describeOpenRouterError(res.status, parsed),
              parseRetryAfter(res.headers?.get?.('retry-after')),
            );
          }
          return parsed;
        },
      );

      const { answers, confidence } = fromSystemOneAnswers(
        (payload.answers ?? {}) as Record<string, unknown>,
      );

      const rawUsage = payload.usage as
        | { cost?: number; input_tokens?: number; output_tokens?: number }
        | undefined;
      const usage = {
        inputTokens: rawUsage?.input_tokens,
        outputTokens: rawUsage?.output_tokens,
        totalTokens:
          rawUsage === undefined
            ? undefined
            : (rawUsage.input_tokens ?? 0) + (rawUsage.output_tokens ?? 0),
      };

      const response: JevResponse = {
        answers: answers as Record<string, JevAnswer>,
        confidence,
        usage,
        // Fully resolved build, not an alias. This is the field the Gateway
        // could never give us.
        modelId: (payload.model as string) ?? this.model,
        generationId: payload.id as string | undefined,
        // Measured, not derived from a hardcoded rate.
        billedCostUsd: rawUsage?.cost,
        latencyMs,
        attempts,
        retryWaitMs,
      };

      this.record({
        label: request.label ?? 'unlabelled',
        state: this.keepFullLog ? request.state : '[omitted]',
        questions: this.keepFullLog ? request.questions : {},
        response,
        latencyMs,
        startedAt,
      });

      this.stats.calls++;
      this.stats.inputTokens += usage.inputTokens ?? 0;
      this.stats.outputTokens += usage.outputTokens ?? 0;
      this.stats.totalLatencyMs += latencyMs;
      this.stats.retryWaitMs += retryWaitMs;
      this.stats.billedCostUsd += rawUsage?.cost ?? 0;

      return response;
    } catch (error) {
      const latencyMs = performance.now() - start;
      this.stats.calls++;
      this.stats.failures++;
      this.stats.totalLatencyMs += latencyMs;

      this.record({
        label: request.label ?? 'unlabelled',
        state: this.keepFullLog ? request.state : '[omitted]',
        questions: this.keepFullLog ? request.questions : {},
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
        startedAt,
      });

      throw error;
    }
  }

  /**
   * Retries transient failures, timing each attempt on its own.
   *
   * The separate timing is the point. An earlier version of the Gateway client
   * measured from the first attempt, so a single backoff added seconds to a
   * figure labelled end-to-end latency. Latency here is the successful
   * attempt; the waiting is reported beside it as `retryWaitMs` so a slow run
   * cannot quietly become a slow model.
   */
  private async withRetry(
    abortSignal: AbortSignal | undefined,
    call: () => Promise<Record<string, unknown>>,
  ): Promise<{
    payload: Record<string, unknown>;
    latencyMs: number;
    attempts: number;
    retryWaitMs: number;
  }> {
    let lastError: unknown;
    let retryWaitMs = 0;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const attemptStart = performance.now();
      try {
        const payload = await call();
        return {
          payload,
          latencyMs: performance.now() - attemptStart,
          attempts: attempt + 1,
          retryWaitMs,
        };
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error, abortSignal?.aborted ?? false)) throw error;
        if (attempt === this.retries) throw error;

        // The server's own Retry-After wins; otherwise a rate limit gets the
        // long ladder and everything else the short one.
        const isRateLimit = error instanceof DecisionsHttpError && error.status === 429;
        const base = isRateLimit ? this.rateLimitBackoffMs : this.backoffMs;
        const hinted = error instanceof DecisionsHttpError ? error.retryAfterMs : undefined;
        const wait = hinted ?? base * 2 ** attempt;
        retryWaitMs += wait;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, wait);
          abortSignal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(abortSignal.reason);
            },
            { once: true },
          );
        });
      }
    }
    throw lastError;
  }

  private async pace(abortSignal?: AbortSignal): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const wait = this.pacingChain.then(async () => {
      const remaining = this.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      this.lastRequestAt = Date.now();
    });
    this.pacingChain = wait.catch(() => undefined);
    await wait;
  }

  private record(log: JevCallLog): void {
    this.calls.push(log);
    if (this.calls.length > this.maxLogEntries) {
      this.calls.splice(0, this.calls.length - this.maxLogEntries);
    }
    this.onCall?.(log);
  }
}

/**
 * Failures are {error: {code, message}}, unlike Cloudflare's list of errors in
 * an envelope. 402 and 429 are called out because they are the two a long
 * benchmark run is most likely to hit, and the generic message hides which.
 */
export function describeOpenRouterError(
  status: number,
  payload: Record<string, unknown>,
): string {
  const error = payload.error as { code?: unknown; message?: unknown } | undefined;
  const message = error?.message ? String(error.message) : undefined;

  if (status === 402) {
    return `OpenRouter is out of credits (402): ${message ?? 'add credits at https://openrouter.ai/credits'}`;
  }
  if (status === 429) {
    return `OpenRouter rate limit hit (429): ${message ?? 'slow down and retry'}`;
  }
  return message
    ? `Decisions request failed (${status}): ${message}`
    : `Decisions request failed (${status})`;
}
