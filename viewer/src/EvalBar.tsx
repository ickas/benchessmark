import { winPct } from '../../src/analysis/quality.js';
import { formatEval } from './derive.js';

/** White's share of the bar is its win chance at the shown position. */
export function EvalBar({ cp }: { cp: number | null }) {
  const white = cp === null ? 50 : winPct(cp);
  return (
    <div className="evalbar" title={cp === null ? 'Not graded yet' : `Stockfish ${formatEval(cp)}`}>
      <i style={{ height: `${white}%` }} />
      <span className={`ev ${white >= 50 ? 'low' : 'high'}`}>{formatEval(cp)}</span>
    </div>
  );
}
