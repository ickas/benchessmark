import type { GameRecord, MoveRecord, PlayerInfo, Termination } from '../record/types.js';
import { eloGap, type EloGap } from './elo.js';
import { gameAccuracy } from './quality.js';
import { mean, percentile } from './stats.js';

export interface PlayerSummary {
  info: PlayerInfo;
  builds: string[];
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points: a win is 1, a draw 0.5. */
  score: number;
  /** Score in the games this player had white. */
  scoreAsWhite: { points: number; games: number };
  /** Games that ended because this player's call failed. */
  errors: number;
  /** Moves the player chose: not book, not forced. */
  moves: number;
  graded: number;
  /** Mean over games of the lichess game accuracy. */
  accuracy: number;
  acpl: number;
  per100: { inaccuracy: number; mistake: number; blunder: number };
  bestRate: number;
  /** Mean probability the player put on Stockfish's move. Models only. */
  pOnBest?: number;
  meanConfidence?: number;
  /** Share of moves where two or more moves shared the top probability. */
  tieRate?: number;
  latency?: { p50: number; p95: number };
  retries: number;
  inputTokensPerCall?: number;
  costUsd?: number;
  costIsBilled: boolean;
  calibration: CalibrationBin[];
}

export interface CalibrationBin {
  range: [number, number];
  n: number;
  bestRate: number;
  meanDrop: number;
  pOnBest: number;
}

export interface RunSummary {
  run: string;
  games: number;
  /** Games that ended in a player error. Not in the score. */
  errorGames: number;
  unfinished: number;
  a: PlayerSummary;
  b: PlayerSummary;
  /** Player A over player B. */
  elo: EloGap;
  terminations: Partial<Record<Termination, number>>;
  engine?: { name: string; depth: number };
}

/** Moves a player chose itself: the ones that say something about it. */
export const isChosen = (m: MoveRecord) => !m.book && !m.forced;

export function summarize(run: string, a: PlayerInfo, b: PlayerInfo, records: GameRecord[]): RunSummary {
  const finished = records.filter((r) => r.termination && r.termination !== 'error');
  const scoresA = finished.map((r) => pointsFor(r, a.id));
  const terminations: RunSummary['terminations'] = {};
  for (const r of records) if (r.termination) terminations[r.termination] = (terminations[r.termination] ?? 0) + 1;

  return {
    run,
    games: records.length,
    errorGames: records.filter((r) => r.termination === 'error').length,
    unfinished: records.filter((r) => !r.termination).length,
    a: summarizePlayer(a, records),
    b: summarizePlayer(b, records),
    elo: eloGap(scoresA),
    terminations,
    ...(records.find((r) => r.engine)?.engine ? { engine: records.find((r) => r.engine)!.engine! } : {}),
  };
}

function pointsFor(r: GameRecord, id: string): number {
  const white = r.white.id === id;
  if (r.result === '1/2-1/2') return 0.5;
  if (r.result === '1-0') return white ? 1 : 0;
  if (r.result === '0-1') return white ? 0 : 1;
  return 0;
}

function summarizePlayer(info: PlayerInfo, records: GameRecord[]): PlayerSummary {
  const finished = records.filter((r) => r.termination && r.termination !== 'error');
  const points = finished.map((r) => pointsFor(r, info.id));
  const asWhite = finished.filter((r) => r.white.id === info.id);

  const moves: MoveRecord[] = [];
  const accuracies: number[] = [];
  const builds = new Set<string>();
  let errors = 0;
  for (const r of records) {
    const side = r.white.id === info.id ? 'w' : 'b';
    for (const b of (side === 'w' ? r.white : r.black).builds) builds.add(b);
    if (r.termination === 'error' && r.errorBy === side) errors++;
    moves.push(...r.moves.filter((m) => m.side === side && isChosen(m)));
    const accuracy = gameAccuracy(r.moves, (m) => m.side === side && isChosen(m));
    if (accuracy !== undefined) accuracies.push(accuracy);
  }

  const graded = moves.filter((m) => m.grade);
  const classes = (c: string) => (graded.length ? (100 * graded.filter((m) => m.grade!.class === c).length) / graded.length : 0);
  const withProbs = graded.filter((m) => Object.keys(m.probabilities).length > 0);
  const withConf = moves.filter((m) => m.confidence !== undefined);
  const calls = moves.filter((m) => m.call);
  const costs = calls.filter((m) => m.call!.costUsd !== undefined);

  return {
    info,
    builds: [...builds],
    games: finished.length,
    wins: points.filter((p) => p === 1).length,
    draws: points.filter((p) => p === 0.5).length,
    losses: points.filter((p) => p === 0).length,
    score: points.reduce((s, p) => s + p, 0),
    scoreAsWhite: { points: asWhite.reduce((s, r) => s + pointsFor(r, info.id), 0), games: asWhite.length },
    errors,
    moves: moves.length,
    graded: graded.length,
    accuracy: mean(accuracies),
    acpl: mean(graded.map((m) => m.grade!.cpLoss)),
    per100: { inaccuracy: classes('inaccuracy'), mistake: classes('mistake'), blunder: classes('blunder') },
    bestRate: graded.length ? graded.filter((m) => m.grade!.class === 'best').length / graded.length : 0,
    ...(withProbs.length ? { pOnBest: mean(withProbs.map((m) => m.probabilities[m.grade!.bestUci] ?? 0)) } : {}),
    ...(withConf.length ? { meanConfidence: mean(withConf.map((m) => m.confidence!)) } : {}),
    ...(withProbs.length ? { tieRate: moves.filter((m) => m.tieCount > 1).length / moves.length } : {}),
    ...(calls.length
      ? {
          latency: {
            p50: percentile(calls.map((m) => m.call!.ms), 0.5),
            p95: percentile(calls.map((m) => m.call!.ms), 0.95),
          },
          inputTokensPerCall: mean(calls.map((m) => m.call!.inputTokens ?? 0)),
        }
      : {}),
    retries: calls.reduce((s, m) => s + m.call!.attempts - 1, 0),
    ...(costs.length ? { costUsd: costs.reduce((s, m) => s + m.call!.costUsd!, 0) } : {}),
    costIsBilled: costs.length > 0 && costs.every((m) => m.call!.costIsBilled),
    calibration: calibration(graded.filter((m) => m.confidence !== undefined)),
  };
}

/**
 * Five bins of confidence. For each: how often the model found the Stockfish
 * move, the mean drop in win chance, and the probability it put on that move.
 * A calibrated model plays better moves when it is more sure.
 */
export function calibration(moves: MoveRecord[]): CalibrationBin[] {
  if (moves.length === 0) return [];
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.000001];
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]!;
    const bin = moves.filter((m) => m.confidence! >= lo && m.confidence! < hi);
    return {
      range: [lo, Math.min(hi, 1)],
      n: bin.length,
      bestRate: mean(bin.map((m) => (m.grade!.class === 'best' ? 1 : 0))),
      meanDrop: mean(bin.map((m) => m.grade!.drop)),
      pOnBest: mean(bin.map((m) => m.probabilities[m.grade!.bestUci] ?? 0)),
    };
  });
}

/* ── text output ── */

const pct = (n: number) => `${(100 * n).toFixed(1)} %`;
const num = (n: number, d = 1) => n.toFixed(d);
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const elo = (n: number) => (Number.isFinite(n) ? `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}` : n > 0 ? '+∞' : '−∞');

export function formatSummary(s: RunSummary): string {
  const { a, b } = s;
  const W = 16;
  const row = (label: string, x: string, y: string) => `${label.padEnd(W)}${x.padEnd(W)}${y}`;
  const both = (f: (p: PlayerSummary) => string) => [f(a), f(b)] as const;
  const opt = (f: (p: PlayerSummary) => string | undefined) => both((p) => f(p) ?? '–');

  const verdict = s.elo.tie ? 'tie' : s.elo.elo > 0 ? `${a.info.name} ahead` : `${b.info.name} ahead`;
  const lines = [
    `${s.run} · ${s.games} games · ${s.errorGames} errors${s.unfinished ? ` · ${s.unfinished} unfinished` : ''}`,
    '',
    row('', a.info.name, b.info.name),
    row('score', ...both((p) => `${num(p.score, 1)} / ${p.games}`)),
    row('W / D / L', ...both((p) => `${p.wins} / ${p.draws} / ${p.losses}`)),
    row('as white', ...both((p) => `${num(p.scoreAsWhite.points, 1)} / ${p.scoreAsWhite.games}`)),
    Number.isFinite(s.elo.elo)
      ? `${'Elo gap'.padEnd(W)}${elo(s.elo.elo)}  95% [${elo(s.elo.low)}, ${elo(s.elo.high)}]  ${verdict}`
      : `${'Elo gap'.padEnd(W)}${elo(s.elo.elo)}  one side won every game; no interval`,
    row('errors', ...both((p) => String(p.errors))),
    '',
    row('moves graded', ...both((p) => `${p.graded} / ${p.moves}`)),
    row('accuracy', ...both((p) => `${num(p.accuracy)} %`)),
    row('ACPL', ...both((p) => num(p.acpl, 0))),
    row('blunders /100', ...both((p) => num(p.per100.blunder))),
    row('mistakes /100', ...both((p) => num(p.per100.mistake))),
    row('inaccur. /100', ...both((p) => num(p.per100.inaccuracy))),
    row('best move', ...both((p) => pct(p.bestRate))),
    row('p on best', ...opt((p) => (p.pOnBest !== undefined ? num(p.pOnBest, 3) : undefined))),
    row('confidence', ...opt((p) => (p.meanConfidence !== undefined ? num(p.meanConfidence, 3) : undefined))),
    row('top tied', ...opt((p) => (p.tieRate !== undefined ? pct(p.tieRate) : undefined))),
    '',
    row('latency p50', ...opt((p) => (p.latency ? `${p.latency.p50} ms` : undefined))),
    row('latency p95', ...opt((p) => (p.latency ? `${p.latency.p95} ms` : undefined))),
    row('retries', ...both((p) => String(p.retries))),
    row('tokens / call', ...opt((p) => (p.inputTokensPerCall !== undefined ? num(p.inputTokensPerCall, 0) : undefined))),
    row('cost', ...opt((p) => (p.costUsd !== undefined ? `${usd(p.costUsd)}${p.costIsBilled ? ' billed' : ' est.'}` : undefined))),
    '',
    `endings   ${Object.entries(s.terminations).map(([k, v]) => `${k} ${v}`).join(' · ') || '–'}`,
    `engine    ${s.engine ? `${s.engine.name}, depth ${s.engine.depth}` : 'not graded yet: npm run grade'}`,
    `builds    ${a.info.name}: ${a.builds.join(', ') || a.info.slug} · ${b.info.name}: ${b.builds.join(', ') || b.info.slug}`,
  ];

  for (const p of [a, b]) {
    if (!p.calibration.length) continue;
    lines.push('', `calibration · ${p.info.name}`, '  confidence   moves   best move   drop    p on best');
    for (const bin of p.calibration) {
      lines.push(
        `  ${bin.range[0].toFixed(1)}–${bin.range[1].toFixed(1)}      ${String(bin.n).padStart(5)}   ${pct(bin.bestRate).padStart(9)}   ${num(bin.meanDrop, 3)}   ${num(bin.pOnBest, 3)}`,
      );
    }
  }
  return lines.join('\n');
}
