import { useEffect, useState } from 'react';
import type { RunSummary } from '../../src/analysis/summary.js';
import type { GameRecord, Opening, PlayerInfo } from '../../src/record/types.js';
import { resultText } from './derive.js';

interface GameBrief {
  id: string;
  path: string;
  opening: Opening;
  white: Pick<PlayerInfo, 'id' | 'name' | 'color'>;
  black: Pick<PlayerInfo, 'id' | 'name' | 'color'>;
  result: GameRecord['result'];
  termination: GameRecord['termination'];
  plies: number;
  graded: boolean;
  video: boolean;
}

interface RunEntry {
  run: string;
  match?: { players: [PlayerInfo, PlayerInfo]; games: number; setupHash: string; startedAt: string; endedAt?: string };
  summary?: RunSummary;
  games: GameBrief[];
}

/** Every run, newest first. A run that is still playing shows LIVE. */
export function RunList() {
  const [runs, setRuns] = useState<RunEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      fetch('/api/runs', { cache: 'no-store' })
        .then((r) => r.json() as Promise<RunEntry[]>)
        .then((data) => {
          setRuns(data);
          if (data.some((r) => !r.match?.endedAt)) timer = setTimeout(load, 2000);
        })
        .catch((e) => setError(String(e)));
    void load();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app runs">
      <header className="top">
        <span className="brand">benchessmark</span>
        <span className="dim">chess between decision models</span>
      </header>
      {error && <div className="banner">{error}</div>}
      {runs && runs.length === 0 && (
        <div className="empty-state">
          <p>No runs yet.</p>
          <code>npm run match -- jev clef</code>
        </div>
      )}
      {runs?.map((r) => <RunCard key={r.run} entry={r} />)}
    </div>
  );
}

function RunCard({ entry }: { entry: RunEntry }) {
  const { match, summary, games } = entry;
  const [a, b] = match?.players ?? [];
  const live = !match?.endedAt;
  return (
    <section className="card run">
      <div className="run-head">
        <h2>
          <span style={{ color: a?.color }}>{a?.name ?? '?'}</span> <span className="vs">vs</span>{' '}
          <span style={{ color: b?.color }}>{b?.name ?? '?'}</span>
        </h2>
        {live && <span className="chip live">LIVE</span>}
        <span className="sp" />
        <span className="dim mono">{entry.run}</span>
      </div>
      <div className="run-meta">
        <span>
          {games.length} of {match?.games ?? '?'} games
        </span>
        <span>setup #{match?.setupHash ?? '–'}</span>
        {summary && (
          <>
            <span>
              score <b>{summary.a.score}</b> – <b>{summary.b.score}</b>
            </span>
            <span>
              Elo gap{' '}
              <b>
                {Number.isFinite(summary.elo.elo) ? `${summary.elo.elo >= 0 ? '+' : '−'}${Math.abs(Math.round(summary.elo.elo))}` : '∞'}
              </b>{' '}
              {summary.elo.tie ? '(tie)' : ''}
            </span>
          </>
        )}
      </div>
      <table className="games">
        <thead>
          <tr>
            <th>game</th>
            <th>opening</th>
            <th>white</th>
            <th>black</th>
            <th>result</th>
            <th>ending</th>
            <th className="num">plies</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id} onClick={() => (window.location.href = `/?game=${g.path}`)}>
              <td className="mono">{g.id}</td>
              <td>
                <span className="dim">{g.opening.eco}</span> {g.opening.name}
              </td>
              <td style={{ color: g.white.color }}>{g.white.name}</td>
              <td style={{ color: g.black.color }}>{g.black.name}</td>
              <td className="mono">{g.termination ? resultText[g.result] : '…'}</td>
              <td className="dim">{g.termination ?? 'playing'}</td>
              <td className="num mono">{g.plies}</td>
              <td className="dim">
                {g.graded ? '' : g.termination && g.termination !== 'error' ? 'grading' : ''}
                {g.video ? ' ▶ mp4' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
