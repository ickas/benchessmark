import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSummary, summarize } from '../analysis/summary.js';
import type { MatchFile } from '../match/run.js';
import { listGames, readGame } from '../record/writer.js';

/** Summarises a run folder, prints it and writes summary.json beside the games. */
export function printSummary(dir: string): void {
  const match = JSON.parse(readFileSync(join(dir, 'match.json'), 'utf8')) as MatchFile;
  const records = listGames(dir).map(readGame);
  const summary = summarize(basename(dir), match.players[0], match.players[1], records);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(formatSummary(summary));
}

/** The newest folder in runs/, by name. */
export function latestRun(runsDir = 'runs'): string | undefined {
  if (!existsSync(runsDir)) return undefined;
  const runs = readdirSync(runsDir)
    .filter((d) => statSync(join(runsDir, d)).isDirectory() && existsSync(join(runsDir, d, 'match.json')))
    .sort();
  const last = runs.at(-1);
  return last ? join(runsDir, last) : undefined;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? latestRun();
  if (!dir) {
    console.error('No run found. Usage: npm run summary -- runs/<run>');
    process.exit(1);
  }
  printSummary(dir);
}
