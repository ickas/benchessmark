import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeGame } from '../analysis/grade.js';
import { Engine } from '../analysis/stockfish.js';
import { playGame } from '../game/play.js';
import { resolvePlayer } from '../players/index.js';
import type { Player } from '../players/types.js';
import type { Difference, GameRecord, PlayerInfo } from '../record/types.js';
import { writeGame } from '../record/writer.js';
import type { Setup } from '../setup.js';
import { knownDifferences } from './differences.js';
import { loadOpenings } from './openings.js';
import { assertSameRequest, formatSetupCheck } from './preflight.js';

export interface MatchFile {
  schema: 'benchessmark/match@1';
  run: string;
  /** Player A, then player B. A has white in odd games. */
  players: [PlayerInfo, PlayerInfo];
  setup: Setup;
  setupHash: string;
  differences: Difference[];
  games: number;
  depth: number | null;
  startedAt: string;
  endedAt?: string;
  harness: GameRecord['harness'];
}

export interface MatchOptions {
  a: string;
  b: string;
  games: number;
  setup: Setup;
  runsDir: string;
  /** Stockfish depth for grading; null to skip grading. */
  depth: number | null;
  threads: number;
  /** Asked once the setup check is printed. Return false to stop. */
  confirm: (check: string) => Promise<boolean>;
  log: (line: string) => void;
}

/** After this many games in a row end in an error, the match stops. */
const MAX_ERRORS_IN_A_ROW = 3;

export async function runMatch(options: MatchOptions): Promise<string | null> {
  const { setup, games } = options;
  const openings = loadOpenings(setup.openings);
  if (games < 1 || games > openings.length * 2) {
    throw new Error(`--games must be between 1 and ${openings.length * 2} (${openings.length} openings × 2 colors)`);
  }

  const run = `${localStamp(new Date())}-${options.a}-vs-${options.b}`;
  const a = await resolvePlayer(options.a, setup, run);
  const b = await resolvePlayer(options.b, setup, run);
  const players: Player[] = [a, b];

  try {
    const setupHash = assertSameRequest(setup, a, b);
    const check = formatSetupCheck(setup, a, b, setupHash, knownDifferences(a.info, b.info), games);
    if (!(await options.confirm(check))) return null;

    const dir = join(options.runsDir, run);
    mkdirSync(dir, { recursive: true });
    const harness = harnessInfo();
    const match: MatchFile = {
      schema: 'benchessmark/match@1',
      run,
      players: [a.info, b.info],
      setup,
      setupHash,
      differences: knownDifferences(a.info, b.info),
      games,
      depth: options.depth,
      startedAt: new Date().toISOString(),
      harness,
    };
    writeFileSync(join(dir, 'match.json'), JSON.stringify(match, null, 2));
    options.log(`\n${dir}/`);

    // Grading runs beside the games: game n is graded while game n+1 plays.
    const engine = options.depth !== null ? await Engine.open({ threads: options.threads }) : null;
    let grading: Promise<void> = Promise.resolve();
    let errorsInARow = 0;

    for (let gameNo = 1; gameNo <= games; gameNo++) {
      const opening = openings[Math.floor((gameNo - 1) / 2)]!;
      const [white, black] = gameNo % 2 === 1 ? [a, b] : [b, a];
      const record: GameRecord = {
        schema: 'benchessmark/game@1',
        id: `g${String(gameNo).padStart(3, '0')}`,
        run,
        gameNo,
        setup,
        setupHash,
        differences: knownDifferences(white.info, black.info),
        white: { ...white.info, builds: [] },
        black: { ...black.info, builds: [] },
        opening,
        moves: [],
        result: '*',
        termination: null,
        startedAt: new Date().toISOString(),
        harness,
      };

      const done = await playGame({ record, white, black, onUpdate: (r) => writeGame(dir, r) });
      options.log(gameLine(done));

      errorsInARow = done.termination === 'error' ? errorsInARow + 1 : 0;
      if (errorsInARow >= MAX_ERRORS_IN_A_ROW) {
        options.log(`\nStopped: ${errorsInARow} games in a row ended in an error. Last: ${done.error}`);
        break;
      }

      if (engine && options.depth !== null && done.termination !== 'error') {
        const depth = options.depth;
        grading = grading.then(async () => writeGame(dir, await gradeGame(done, engine, depth)));
      }
    }

    if (engine) {
      options.log('\nWaiting for Stockfish to grade the last games…');
      await grading;
      await engine.close();
    }
    match.endedAt = new Date().toISOString();
    writeFileSync(join(dir, 'match.json'), JSON.stringify(match, null, 2));
    return dir;
  } finally {
    await Promise.all(players.map((p) => p.close?.()));
  }
}

function gameLine(r: GameRecord): string {
  const result = r.result === '1/2-1/2' ? '½-½' : r.result;
  const ending = r.termination === 'error' ? `error: ${r.error?.slice(0, 60)}` : r.termination;
  const opening = `${r.opening.eco} ${r.opening.name}`.slice(0, 32).padEnd(34);
  const white = `${r.white.name.slice(0, 15)} w`.padEnd(19);
  return `${r.id}  ${opening}${white}${result.padEnd(5)}${String(r.moves.length).padStart(3)}  ${ending}`;
}

/** "2026-10-06T18-40", in local time: the name sorts and reads as the clock did. */
function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`;
}

function harnessInfo(): GameRecord['harness'] {
  let gitSha = 'none';
  try {
    gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    if (dirty) gitSha += '+dirty';
  } catch {
    // Not a git checkout.
  }
  let chessJs = 'unknown';
  try {
    const pkg = new URL('../../node_modules/chess.js/package.json', import.meta.url);
    chessJs = (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
  } catch {
    // Installed somewhere else; the version is only informative.
  }
  return { gitSha, chessJs, node: process.version };
}
