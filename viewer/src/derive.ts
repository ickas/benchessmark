import { Chess } from 'chess.js';
import type { GameRecord, MoveRecord, PlayerRecord, Side } from '../../src/record/types.js';
import { gameAccuracy } from '../../src/analysis/quality.js';

/** Everything the board needs, computed once per version of the record. */
export interface Derived {
  /** fens[p]: the position after p moves. */
  fens: string[];
  /** White's evaluation of position p, in centipawns, once graded. */
  evalWhite: (number | null)[];
}

export function derive(record: GameRecord): Derived {
  const fens = record.moves.map((m) => m.fenBefore);
  const last = record.moves.at(-1);
  if (last) {
    const chess = new Chess(last.fenBefore);
    chess.move(last.uci);
    fens.push(chess.fen());
  } else {
    fens.push(new Chess().fen());
  }

  const sign = (m: MoveRecord) => (m.side === 'w' ? 1 : -1);
  const evalWhite = record.moves.map((m) => (m.grade ? sign(m) * m.grade.cpBefore : null));
  evalWhite.push(last?.grade ? sign(last) * last.grade.cpAfter : null);
  return { fens, evalWhite };
}

export interface Candidate {
  uci: string;
  san: string;
  p: number;
  picked: boolean;
}

/** The top options of move `index`, most probable first, and what is left. */
export function candidates(move: MoveRecord | undefined, top = 3): { list: Candidate[]; rest: number; restCount: number } {
  if (!move || !Object.keys(move.probabilities).length) return { list: [], rest: 0, restCount: 0 };
  const sanOf = sanMap(move.fenBefore);
  const sorted = Object.entries(move.probabilities).sort((a, b) => b[1] - a[1]);
  const list = sorted.slice(0, top).map(([uci, p]) => ({ uci, san: sanOf[uci] ?? uci, p, picked: uci === move.uci }));
  // The played move is always shown, even when a tie put it outside the top.
  if (!list.some((c) => c.picked)) {
    list[list.length - 1] = { uci: move.uci, san: move.san, p: move.probabilities[move.uci] ?? 0, picked: true };
  }
  const shown = list.reduce((s, c) => s + c.p, 0);
  return { list, rest: Math.max(0, 1 - shown), restCount: Math.max(0, sorted.length - list.length) };
}

function sanMap(fen: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of new Chess(fen).moves({ verbose: true })) out[m.lan] = m.san;
  return out;
}

export interface SideStats {
  moves: number;
  accuracy?: number;
  acpl?: number;
  bestRate?: number;
  p50?: number;
  costUsd?: number;
  costIsBilled: boolean;
}

/** One side's numbers over the moves played before position `pos`. */
export function sideStats(record: GameRecord, side: Side, pos: number): SideStats {
  const played = record.moves.slice(0, pos);
  const mine = played.filter((m) => m.side === side && !m.book && !m.forced);
  const graded = mine.filter((m) => m.grade);
  const calls = mine.filter((m) => m.call).map((m) => m.call!);
  const ms = calls.map((c) => c.ms).sort((a, b) => a - b);
  const cost = calls.filter((c) => c.costUsd !== undefined);
  const accuracy = played.every((m) => m.grade) ? gameAccuracy(played, (m) => m.side === side && !m.book && !m.forced) : undefined;

  return {
    moves: mine.length,
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(graded.length
      ? {
          acpl: graded.reduce((s, m) => s + m.grade!.cpLoss, 0) / graded.length,
          bestRate: graded.filter((m) => m.grade!.class === 'best').length / graded.length,
        }
      : {}),
    ...(ms.length ? { p50: ms[Math.ceil(ms.length / 2) - 1]! } : {}),
    ...(cost.length ? { costUsd: cost.reduce((s, c) => s + c.costUsd!, 0) } : {}),
    costIsBilled: cost.length > 0 && cost.every((c) => c.costIsBilled),
  };
}

export const playerOf = (record: GameRecord, side: Side): PlayerRecord => (side === 'w' ? record.white : record.black);

export function formatEval(cp: number | null): string {
  if (cp === null) return '–';
  if (Math.abs(cp) === 10_000) return '#';
  if (Math.abs(cp) >= 9_000) return `${cp > 0 ? '' : '−'}M${10_000 - Math.abs(cp)}`;
  const pawns = cp / 100;
  return `${pawns >= 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
}

export function formatUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export const resultText: Record<GameRecord['result'], string> = {
  '1-0': '1–0',
  '0-1': '0–1',
  '1/2-1/2': '½–½',
  '*': '*',
};
