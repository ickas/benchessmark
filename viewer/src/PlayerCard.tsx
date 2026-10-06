import type { CSSProperties } from 'react';
import type { MoveRecord, PlayerRecord, Side } from '../../src/record/types.js';
import { candidates, formatUsd, type SideStats } from './derive.js';

interface PlayerCardProps {
  player: PlayerRecord;
  side: Side;
  /** This player is to move at the shown position. */
  active: boolean;
  /** The move this player is about to play (when active). */
  next: MoveRecord | undefined;
  /** This player's latest move before the shown position. */
  last: MoveRecord | undefined;
  stats: SideStats;
  moveNumber: (m: MoveRecord) => string;
}

export function PlayerCard({ player, side, active, next, last, stats, moveNumber }: PlayerCardProps) {
  const build = player.builds.at(-1) ?? player.slug;
  const cand = active ? candidates(next) : { list: [], rest: 0, restCount: 0 };

  return (
    <section className={`card player${active ? ' on' : ''}`} style={{ '--accent': player.color } as CSSProperties}>
      <div className="who">
        <span className="dot" />
        <span className="nm">{player.name}</span>
        <span className="mk">{player.maker}</span>
        <span className={`tag${active ? ' go' : ''}`}>
          {side === 'w' ? 'white' : 'black'}
          {active ? ' · to move' : ''}
        </span>
      </div>
      <div className="slug">
        {build}
        {active && next ? ` · ${next.legal} legal` : ''}
      </div>

      {active && cand.list.length > 0 ? (
        <div className="cands">
          {cand.list.map((c) => (
            <div className={`cand${c.picked ? ' picked' : ''}`} key={c.uci}>
              <b>{c.san}</b>
              <span className="bar">
                <i style={{ width: `${Math.max(1.5, c.p * 100)}%` }} />
              </span>
              <span className="p">{pct(c.p)}</span>
            </div>
          ))}
          {cand.restCount > 0 && (
            <div className="cand rest">
              <span>{cand.restCount} more</span>
              <span className="bar">
                <i style={{ width: `${cand.rest * 100}%` }} />
              </span>
              <span className="p">{pct(cand.rest)}</span>
            </div>
          )}
          {next?.confidence !== undefined && (
            <div className="meta">
              confidence <b>{next.confidence.toFixed(2)}</b>
              {next.tieCount > 1 ? <span className="warn"> · {next.tieCount} tied at the top</span> : null}
              {next.call ? ` · ${next.call.ms} ms` : ''}
            </div>
          )}
        </div>
      ) : active && next ? (
        <div className="last">{next.book ? 'Book move' : next.forced ? 'Forced move, no call' : `${player.name} to move`}</div>
      ) : last ? (
        <div className="last">
          Last <b>{moveNumber(last)} {last.san}</b>
          <span className="dim">
            {last.book ? ' · book' : last.forced ? ' · forced' : ''}
            {last.probabilities[last.uci] !== undefined ? ` · p ${prob(last.probabilities[last.uci]!)}` : ''}
            {last.call ? ` · ${last.call.ms} ms` : ''}
          </span>
        </div>
      ) : (
        <div className="last dim">No move yet</div>
      )}

      <div className="stats">
        <span>
          accuracy <b>{stats.accuracy !== undefined ? `${Math.round(stats.accuracy)}%` : '–'}</b>
        </span>
        <span>
          ACPL <b>{stats.acpl !== undefined ? Math.round(stats.acpl) : '–'}</b>
        </span>
        <span>
          p50 <b>{stats.p50 !== undefined ? `${stats.p50} ms` : '–'}</b>
        </span>
        <span>
          cost <b>{stats.costUsd !== undefined ? formatUsd(stats.costUsd) : '–'}</b>
        </span>
      </div>
    </section>
  );
}

/** As the provider returned it, without float noise: 0.35, 0.3964. */
const prob = (p: number) => String(Number(p.toPrecision(6)));

const pct = (p: number) => (p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
