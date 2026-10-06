import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import type { GameRecord } from './types.js';

/**
 * Writes the game as JSON, then a PGN copy. The JSON goes to a temporary file
 * first and is renamed into place, so the viewer never reads half a file and a
 * crash loses one move at most.
 */
export function writeGame(dir: string, record: GameRecord): void {
  const path = join(dir, `${record.id}.json`);
  writeFileSync(`${path}.tmp`, JSON.stringify(record, null, 1));
  renameSync(`${path}.tmp`, path);
  if (record.termination) writeFileSync(join(dir, `${record.id}.pgn`), toPgn(record));
}

export function readGame(path: string): GameRecord {
  return JSON.parse(readFileSync(path, 'utf8')) as GameRecord;
}

/** Every game file in a run folder, in game order. */
export function listGames(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^g\d+\.json$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

export function toPgn(record: GameRecord): string {
  const chess = new Chess();
  for (const move of record.moves) chess.move(move.uci);

  const name = (p: GameRecord['white']) => `${p.name} (${p.builds[0] ?? p.slug})`;
  chess.setHeader('Event', `benchessmark ${record.run}`);
  chess.setHeader('Site', 'benchessmark');
  chess.setHeader('Date', record.startedAt.slice(0, 10).replaceAll('-', '.'));
  chess.setHeader('Round', String(record.gameNo));
  chess.setHeader('White', name(record.white));
  chess.setHeader('Black', name(record.black));
  chess.setHeader('Result', record.result);
  chess.setHeader('ECO', record.opening.eco);
  chess.setHeader('Opening', record.opening.name);
  if (record.termination) chess.setHeader('Termination', record.termination);
  return chess.pgn() + '\n';
}
