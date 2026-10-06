import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const RUNS = resolve(import.meta.dirname, 'runs');

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.pgn': 'application/x-chess-pgn',
  '.mp4': 'video/mp4',
};

/**
 * Serves the run folders to the viewer. The viewer only reads files the
 * runner wrote; it never calls a model and the page holds no API key.
 *
 *   GET /api/runs            every run, newest first, with a line per game
 *   GET /runs/<run>/<file>   one file from a run
 */
function runsPlugin(): Plugin {
  return {
    name: 'benchessmark-runs',
    configureServer(server) {
      server.middlewares.use('/api/runs', (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify(listRuns()));
      });
      server.middlewares.use('/runs', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^([/\\])+/, '');
        const path = join(RUNS, rel);
        const type = TYPES[extname(path)];
        if (!path.startsWith(RUNS + '/') || !type || !existsSync(path) || !statSync(path).isFile()) return next();
        res.setHeader('content-type', type);
        res.setHeader('cache-control', 'no-store');
        res.end(readFileSync(path));
      });
    },
  };
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function listRuns() {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((run) => existsSync(join(RUNS, run, 'match.json')))
    .sort()
    .reverse()
    .map((run) => {
      const dir = join(RUNS, run);
      const games = readdirSync(dir)
        .filter((f) => /^g\d+\.json$/.test(f))
        .sort()
        .map((f) => {
          const g = readJson(join(dir, f));
          if (!g) return null;
          return {
            id: g.id,
            path: `runs/${run}/${f}`,
            opening: g.opening,
            white: { id: g.white.id, name: g.white.name, color: g.white.color },
            black: { id: g.black.id, name: g.black.name, color: g.black.color },
            result: g.result,
            termination: g.termination,
            plies: g.moves.length,
            graded: Boolean(g.engine),
            video: existsSync(join(dir, f.replace('.json', '.mp4'))),
          };
        })
        .filter(Boolean);
      return { run, match: readJson(join(dir, 'match.json')), summary: readJson(join(dir, 'summary.json')), games };
    });
}

export default defineConfig({
  root: 'viewer',
  plugins: [react(), runsPlugin()],
  server: { port: 5173 },
});
