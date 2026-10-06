import { readFileSync } from 'node:fs';
import type { Opening } from '../record/types.js';

interface OpeningRow {
  eco: string;
  name: string;
  pgn: string;
  uci: string;
}

/** Reads data/openings.json (built by scripts/build-openings.ts). */
export function loadOpenings(path: string): Opening[] {
  const rows = JSON.parse(readFileSync(path, 'utf8')) as OpeningRow[];
  return rows.map((row) => ({ eco: row.eco, name: row.name, pgn: row.pgn, uci: row.uci.split(' ') }));
}
