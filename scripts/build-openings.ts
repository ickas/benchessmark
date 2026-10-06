/**
 * Builds data/openings.json: the 50 opening lines every match plays, once with
 * each model as white.
 *
 * The lines are chosen here, by hand, to cover the main families (open games,
 * Sicilians, French, Caro-Kann, queen's pawn, Indian defences, flank openings)
 * without any very sharp gambits. Names and ECO codes are not typed by hand:
 * they come from lichess-org/chess-openings (CC0), matched on the move order.
 * A line that is not an exact entry takes the name of its longest named prefix.
 *
 *   npx tsx scripts/build-openings.ts
 */
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const SOURCE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

const LINES = [
  // Open games
  'e4 e5 Nf3 Nc6 Bb5 a6',
  'e4 e5 Nf3 Nc6 Bb5 Nf6',
  'e4 e5 Nf3 Nc6 Bc4 Bc5',
  'e4 e5 Nf3 Nc6 Bc4 Nf6',
  'e4 e5 Nf3 Nc6 d4 exd4',
  'e4 e5 Nf3 Nc6 Nc3 Nf6',
  'e4 e5 Nf3 Nf6',
  'e4 e5 Nf3 d6',
  'e4 e5 f4',
  'e4 e5 Nc3',
  'e4 e5 Bc4',
  // Sicilian
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5',
  'e4 c5 Nf3 e6',
  'e4 c5 Nf3 Nc6 Bb5',
  'e4 c5 c3',
  'e4 c5 Nc3',
  // French, Caro-Kann and other replies to e4
  'e4 e6 d4 d5 Nc3 Bb4',
  'e4 e6 d4 d5 Nd2',
  'e4 e6 d4 d5 e5',
  'e4 c6 d4 d5 e5',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5',
  'e4 d5 exd5 Qxd5',
  'e4 d6 d4 Nf6 Nc3 g6',
  'e4 g6',
  'e4 Nf6',
  // Queen's pawn
  'd4 d5 c4 e6 Nc3 Nf6',
  'd4 d5 c4 dxc4',
  'd4 d5 c4 c6',
  'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6',
  'd4 d5 Bf4',
  'd4 d5 e3',
  // Indian defences
  'd4 Nf6 c4 e6 Nc3 Bb4',
  'd4 Nf6 c4 e6 Nf3 b6',
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6',
  'd4 Nf6 c4 g6 Nc3 d5',
  'd4 Nf6 c4 e6 g3',
  'd4 Nf6 c4 c5 d5 e6',
  'd4 Nf6 c4 c5 d5 b5',
  'd4 Nf6 Nf3 e6 Bg5',
  'd4 Nf6 Bg5',
  'd4 f5',
  // Flank openings
  'c4 e5',
  'c4 c5',
  'c4 Nf6 Nc3 e6',
  'Nf3 d5 g3',
  'Nf3 Nf6 c4',
  'g3',
  'b3',
];

interface Entry {
  eco: string;
  name: string;
  pgn: string;
  uci: string;
}

async function loadLichess(): Promise<Map<string, { eco: string; name: string }>> {
  const byMoves = new Map<string, { eco: string; name: string }>();
  for (const file of ['a', 'b', 'c', 'd', 'e']) {
    const res = await fetch(`${SOURCE}/${file}.tsv`);
    if (!res.ok) throw new Error(`Could not fetch ${file}.tsv (${res.status})`);
    const rows = (await res.text()).trim().split('\n').slice(1);
    for (const row of rows) {
      const [eco, name, pgn] = row.split('\t');
      if (!eco || !name || !pgn) continue;
      byMoves.set(sanList(pgn).join(' '), { eco, name });
    }
  }
  return byMoves;
}

/** "1. e4 e5 2. Nf3" → ["e4", "e5", "Nf3"] */
function sanList(pgn: string): string[] {
  return pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t));
}

function toPgn(sans: string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
}

const lichess = await loadLichess();
const entries: Entry[] = [];

for (const line of LINES) {
  const sans = line.split(' ');
  const chess = new Chess();
  const uci = sans.map((san) => {
    const move = chess.move(san);
    return move.lan;
  });

  let named: { eco: string; name: string } | undefined;
  for (let n = sans.length; n > 0 && !named; n--) named = lichess.get(sans.slice(0, n).join(' '));
  if (!named) throw new Error(`No lichess name for "${line}"`);

  entries.push({ eco: named.eco, name: named.name, pgn: toPgn(sans), uci: uci.join(' ') });
}

const seen = new Set<string>();
for (const e of entries) {
  if (seen.has(e.uci)) throw new Error(`Duplicate line: ${e.pgn}`);
  seen.add(e.uci);
}

writeFileSync('data/openings.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Wrote ${entries.length} openings to data/openings.json`);
