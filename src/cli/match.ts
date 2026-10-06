import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { loadEnv } from '../env.js';
import { DEFAULT_DEPTH } from '../analysis/grade.js';
import { runMatch } from '../match/run.js';
import { DEFAULT_SETUP, type Setup } from '../setup.js';
import { printSummary } from './summary.js';

loadEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    games: { type: 'string', default: '100' },
    seed: { type: 'string' },
    depth: { type: 'string', default: String(DEFAULT_DEPTH) },
    threads: { type: 'string', default: '1' },
    'no-grade': { type: 'boolean', default: false },
    'min-interval-ms': { type: 'string' },
    runs: { type: 'string', default: 'runs' },
    yes: { type: 'boolean', short: 'y', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [a, b] = positionals;
if (values.help || !a || !b) {
  console.log(`Usage: npm run match -- <playerA> <playerB> [options]

Players: jev, clef, clef-flash (src/models.ts), random, stockfish-<elo>

  --games N            games to play, 2 per opening (default 100)
  --seed N             seed for tie breaks (default ${DEFAULT_SETUP.seed})
  --depth N            Stockfish depth for grading (default ${DEFAULT_DEPTH})
  --threads N          Stockfish threads for grading (default 1)
  --no-grade           skip grading; run "npm run grade" later
  --min-interval-ms N  minimum gap between requests (default 0)
  -y, --yes            start without asking`);
  process.exit(values.help ? 0 : 1);
}

const setup: Setup = {
  ...DEFAULT_SETUP,
  ...(values.seed ? { seed: Number(values.seed) } : {}),
  ...(values['min-interval-ms'] ? { minIntervalMs: Number(values['min-interval-ms']) } : {}),
};
const games = Number(values.games);

const dir = await runMatch({
  a,
  b,
  games,
  setup,
  runsDir: values.runs,
  depth: values['no-grade'] ? null : Number(values.depth),
  threads: Number(values.threads),
  log: (line) => console.log(line),
  confirm: async (check) => {
    console.log(check);
    if (values.yes) return true;
    if (!process.stdin.isTTY) {
      console.error('\nNot a terminal: pass --yes to start without asking.');
      return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`\nStart ${games} games? [Y/n] `)).trim().toLowerCase();
    rl.close();
    return answer === '' || answer === 'y' || answer === 'yes';
  },
});

if (dir) {
  console.log('');
  printSummary(dir);
  console.log(`\nReplay: npm run viewer, then open http://localhost:5173`);
}
