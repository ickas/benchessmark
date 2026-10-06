import { useEffect, useState } from 'react';
import type { GameRecord } from '../../src/record/types.js';

/**
 * Loads a game file. While the game runs (termination is null) it reads the
 * file again every second, so the viewer follows a match as it plays.
 */
export function useGame(path: string, poll = true): { record: GameRecord | null; error: string | null } {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const res = await fetch(`/${path.replace(/^\/+/, '')}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const next = (await res.json()) as GameRecord;
        if (stopped) return;
        setRecord(next);
        setError(null);
        // Keep reading while the game runs, and once more until it is graded.
        if (poll && (!next.termination || (next.termination !== 'error' && !next.engine))) timer = setTimeout(load, 1000);
      } catch (e) {
        if (stopped) return;
        setError(`Could not load ${path}: ${e instanceof Error ? e.message : String(e)}`);
        timer = setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [path, poll]);

  return { record, error };
}
