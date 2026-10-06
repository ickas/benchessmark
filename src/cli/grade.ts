import { parseArgs } from 'node:util';
import { DEFAULT_DEPTH, gradeRun } from '../analysis/grade.js';
import { latestRun, printSummary } from './summary.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    depth: { type: 'string', default: String(DEFAULT_DEPTH) },
    threads: { type: 'string', default: '1' },
    force: { type: 'boolean', default: false },
  },
});

const dir = positionals[0] ?? latestRun();
if (!dir) {
  console.error('No run found. Usage: npm run grade -- runs/<run> [--depth 18] [--threads 1] [--force]');
  process.exit(1);
}

const graded = await gradeRun(dir, {
  depth: Number(values.depth),
  threads: Number(values.threads),
  force: values.force,
  onGame: (r) => console.log(`graded ${r.id}  ${r.moves.length} plies`),
});
console.log(`\n${graded} games graded at depth ${values.depth}.\n`);
printSummary(dir);
