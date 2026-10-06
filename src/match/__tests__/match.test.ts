import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { JevClient, JevRequest, JevResponse } from '../../client/types.js';
import { MODELS } from '../../models.js';
import { makeModelPlayer } from '../../players/model.js';
import { DEFAULT_SETUP } from '../../setup.js';
import { makeRng } from '../../rng.js';
import { knownDifferences } from '../differences.js';
import { loadOpenings } from '../openings.js';
import { assertSameRequest } from '../preflight.js';

function fakeClient(reply: (req: JevRequest) => Partial<JevResponse>): JevClient & { requests: JevRequest[] } {
  const requests: JevRequest[] = [];
  return {
    requests,
    log: [],
    stats: { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 },
    async ask(req) {
      requests.push(req);
      return { answers: {}, confidence: {}, usage: {}, modelId: 'test', latencyMs: 1, ...reply(req) };
    },
  };
}

describe('the setup check', () => {
  it('passes for Jev and Clef: their requests differ only in the model', () => {
    const jev = makeModelPlayer('jev', MODELS.jev, DEFAULT_SETUP, { client: fakeClient(() => ({})) });
    const clef = makeModelPlayer('clef', MODELS.clef, DEFAULT_SETUP, { client: fakeClient(() => ({})) });
    expect(assertSameRequest(DEFAULT_SETUP, jev, clef)).toMatch(/^[0-9a-f]{6}$/);
    expect(jev.requestFor!(new Chess()).model).toBe('typesafe/jev-1.13');
    expect(clef.requestFor!(new Chess()).model).toBe('cloudflare/clef');
  });

  it('stops a match when one player would get a different question', () => {
    const jev = makeModelPlayer('jev', MODELS.jev, DEFAULT_SETUP, { client: fakeClient(() => ({})) });
    const other = makeModelPlayer('clef', MODELS.clef, { ...DEFAULT_SETUP, instructions: 'Think hard. {side}' }, {
      client: fakeClient(() => ({})),
    });
    expect(() => assertSameRequest(DEFAULT_SETUP, jev, other)).toThrow(/not get the same request/);
  });

  it('stops a match when the transport settings differ', () => {
    const jev = makeModelPlayer('jev', MODELS.jev, DEFAULT_SETUP, { client: fakeClient(() => ({})) });
    const slow = makeModelPlayer('clef', MODELS.clef, { ...DEFAULT_SETUP, timeoutMs: 5_000 }, {
      client: fakeClient(() => ({})),
    });
    expect(() => assertSameRequest(DEFAULT_SETUP, jev, slow)).toThrow(/transport settings/);
  });

  it('names the three differences no setting removes', () => {
    const diffs = knownDifferences(
      { id: 'jev', ...MODELS.jev, kind: 'model' },
      { id: 'clef', ...MODELS.clef, kind: 'model' },
    );
    expect(diffs.map((d) => [d.what, d.white, d.black])).toEqual([
      ['probability decimals', '2', '4'],
      ['build reported', 'resolved build', 'alias only'],
      ['state read limit', '32k tokens', '≈2k tokens'],
    ]);
  });
});

describe('a model player', () => {
  it('sends the legal moves and records the call', async () => {
    const client = fakeClient(() => ({
      answers: { move: { type: 'choice', choice: 'e2e4', probabilities: { e2e4: 0.62, d2d4: 0.3, g1f3: 0.08 } } },
      confidence: { move: 0.55 },
      usage: { inputTokens: 640, outputTokens: 0 },
      modelId: 'typesafe/jev-1.13-20260917',
      generationId: 'gen-1',
      billedCostUsd: 0.000027,
      latencyMs: 212.4,
      attempts: 1,
      retryWaitMs: 0,
    }));
    const jev = makeModelPlayer('jev', MODELS.jev, DEFAULT_SETUP, { client });
    const chess = new Chess();
    const decision = await jev.decide({ chess, legal: chess.moves({ verbose: true }), rng: makeRng(1), label: 'g001/ply1' });

    expect(decision.move.san).toBe('e4');
    expect(decision.confidence).toBe(0.55);
    expect(decision.call).toEqual({
      ms: 212, attempts: 1, retryWaitMs: 0, inputTokens: 640, outputTokens: 0,
      costUsd: 0.000027, costIsBilled: true, build: 'typesafe/jev-1.13-20260917', id: 'gen-1',
    });
    expect(Object.keys(client.requests[0]!.questions.move!.criteria as object)).toHaveLength(20);
    expect(client.requests[0]!.label).toBe('g001/ply1');
  });
});

describe('the openings', () => {
  it('holds 50 different lines, all legal from the start position', () => {
    const openings = loadOpenings('data/openings.json');
    expect(openings).toHaveLength(50);
    expect(new Set(openings.map((o) => o.uci.join(' '))).size).toBe(50);
    for (const o of openings) {
      const chess = new Chess();
      for (const uci of o.uci) expect(() => chess.move(uci)).not.toThrow();
      expect(o.uci.length).toBeGreaterThanOrEqual(1);
      expect(o.uci.length).toBeLessThanOrEqual(10);
    }
  });
});
