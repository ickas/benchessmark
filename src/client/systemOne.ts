// Copied from battleship-vs-jev src/jev/systemOne.ts on 2026-10-06. Change it there first.
import type { JevAnswer, JevQuestion, ChoiceAnswer, ScoreAnswer } from './types.js';

/**
 * Translation between this project's question shapes and the System One wire
 * format, which TypeSafe's Jev and Cloudflare's Clef both speak.
 *
 * The two providers differ in transport, auth and pricing, but their request
 * questions and response answers are field-for-field identical: `noul` carries
 * a probability, `choice` carries choice/probabilities/confidence, `score`
 * adds a legend, and usage is {input_tokens, output_tokens}. Verified against
 * the shipped TypeSafe SDK types and Cloudflare's published JSON schema on
 * 2026-10-06. Keeping this in one place is what makes a second backend cheap.
 */

/** Turns this project's questions into the System One wire format. */
export function toSystemOneQuestions(
  questions: Record<string, JevQuestion>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [id, question] of Object.entries(questions)) {
    if (question.type === 'boolean') {
      // The AI SDK's `boolean` is TypeSafe's "Noul".
      out[id] = {
        type: 'noul',
        instructions: question.instructions,
        ...(question.criteria ? { criteria: question.criteria } : {}),
      };
    } else if (question.type === 'choice') {
      out[id] = {
        type: 'choice',
        instructions: question.instructions,
        criteria: question.criteria,
      };
    } else {
      out[id] = {
        type: 'score',
        instructions: question.instructions,
        criteria: question.criteria,
      };
    }
  }
  return out;
}

/**
 * Translates System One answers back, and lifts the per-answer `confidence`
 * into the separate map this project uses, matching the Gateway's shape.
 */
export function fromSystemOneAnswers(raw: Record<string, unknown>): {
  answers: Record<string, JevAnswer>;
  confidence: Record<string, number>;
} {
  const answers: Record<string, JevAnswer> = {};
  const confidence: Record<string, number> = {};

  for (const [id, value] of Object.entries(raw)) {
    const answer = value as Record<string, unknown>;

    if (answer.type === 'noul') {
      answers[id] = { type: 'boolean', probability: Number(answer.noul) };
      continue;
    }

    if (typeof answer.confidence === 'number') confidence[id] = answer.confidence;

    if (answer.type === 'choice') {
      answers[id] = {
        type: 'choice',
        choice: String(answer.choice),
        probabilities: answer.probabilities as ChoiceAnswer['probabilities'],
      };
    } else if (answer.type === 'score') {
      answers[id] = {
        type: 'score',
        score: Number(answer.score),
        probabilities: answer.probabilities as ScoreAnswer['probabilities'],
      };
    }
  }

  return { answers, confidence };
}

