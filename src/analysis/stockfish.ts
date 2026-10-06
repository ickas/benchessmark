import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface EngineOptions {
  /** Default: STOCKFISH_PATH, then `stockfish` on PATH. */
  path?: string;
  threads?: number;
  hashMb?: number;
  /** Extra UCI options, e.g. { UCI_LimitStrength: true, UCI_Elo: 1320 }. */
  options?: Record<string, string | number | boolean>;
}

export interface Analysis {
  /** For the side to move. Mate is ±(10000 − moves to mate). */
  cp: number;
  mate?: number;
  bestUci: string;
  depth: number;
}

export const MATE_CP = 10_000;

/** A Stockfish process over UCI. One command at a time. */
export class Engine {
  name = 'Stockfish';
  private readonly lines: string[] = [];
  private waiter: { test: (line: string) => boolean; resolve: (lines: string[]) => void; seen: string[] } | null =
    null;
  private queue: Promise<unknown> = Promise.resolve();
  private exited: Error | null = null;

  private constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    proc.on('exit', (code) => {
      this.exited = new Error(`Stockfish exited (code ${code})`);
    });
  }

  static async open(options: EngineOptions = {}): Promise<Engine> {
    const path = options.path ?? process.env.STOCKFISH_PATH ?? 'stockfish';
    const proc = spawn(path, [], { stdio: 'pipe' });
    await new Promise<void>((resolve, reject) => {
      proc.once('spawn', resolve);
      proc.once('error', (error) =>
        reject(
          new Error(
            `Could not start Stockfish at "${path}" (${error.message}). ` +
              'Install it with `brew install stockfish`, or set STOCKFISH_PATH.',
          ),
        ),
      );
    });

    const engine = new Engine(proc);
    const ids = await engine.command('uci', (l) => l === 'uciok');
    const name = ids.find((l) => l.startsWith('id name '));
    if (name) engine.name = name.slice('id name '.length).trim();

    const settings: Record<string, string | number | boolean> = {
      Threads: options.threads ?? 1,
      Hash: options.hashMb ?? 256,
      ...options.options,
    };
    for (const [key, value] of Object.entries(settings)) engine.send(`setoption name ${key} value ${value}`);
    await engine.command('isready', (l) => l === 'readyok');
    return engine;
  }

  /** Searches a position to a fixed depth (or for a fixed time). */
  analyse(fen: string, limit: { depth?: number; movetime?: number }): Promise<Analysis> {
    return this.serial(async () => {
      this.send(`position fen ${fen}`);
      const go = limit.depth !== undefined ? `go depth ${limit.depth}` : `go movetime ${limit.movetime ?? 100}`;
      const out = await this.command(go, (l) => l.startsWith('bestmove'));
      return parseSearch(out);
    });
  }

  async close(): Promise<void> {
    if (this.exited) return;
    this.send('quit');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.proc.kill();
        resolve();
      }, 1_000);
      this.proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private send(cmd: string): void {
    if (this.exited) throw this.exited;
    this.proc.stdin.write(cmd + '\n');
  }

  private command(cmd: string, done: (line: string) => boolean): Promise<string[]> {
    const result = new Promise<string[]>((resolve) => {
      this.waiter = { test: done, resolve, seen: [] };
    });
    this.send(cmd);
    return result;
  }

  private onLine(line: string): void {
    const waiter = this.waiter;
    if (!waiter) return;
    waiter.seen.push(line);
    if (waiter.test(line)) {
      this.waiter = null;
      waiter.resolve(waiter.seen);
    }
  }
}

/** Reads the last scored `info` line and the `bestmove` line. */
export function parseSearch(lines: string[]): Analysis {
  let cp = 0;
  let mate: number | undefined;
  let depth = 0;

  for (const line of lines) {
    // A bound is a partial score from an aspiration window, not the result.
    if (!line.startsWith('info ') || /\b(lower|upper)bound\b/.test(line)) continue;
    const scored = line.match(/ depth (\d+).* score (cp|mate) (-?\d+)/);
    if (!scored) continue;
    depth = Number(scored[1]);
    if (scored[2] === 'cp') {
      cp = Number(scored[3]);
      mate = undefined;
    } else {
      mate = Number(scored[3]);
      cp = mateToCp(mate);
    }
  }

  const best = lines.find((l) => l.startsWith('bestmove'))?.split(' ')[1] ?? '(none)';
  return { cp, ...(mate !== undefined ? { mate } : {}), bestUci: best, depth };
}

/** Mate in n for the side to move → large positive; mated → large negative. */
export function mateToCp(mate: number): number {
  if (mate === 0) return -MATE_CP;
  return mate > 0 ? MATE_CP - mate : -MATE_CP - mate;
}
