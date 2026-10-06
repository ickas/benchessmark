import type { MoveRecord } from '../../src/record/types.js';

interface TimelineProps {
  moves: MoveRecord[];
  pos: number;
  onSeek?: (pos: number) => void;
}

/** One mark for each ply. Height is the drop in win chance; colour is the grade. */
export function Timeline({ moves, pos, onSeek }: TimelineProps) {
  return (
    <div className="ticks" role="slider" aria-valuemin={0} aria-valuemax={moves.length} aria-valuenow={pos}>
      {moves.map((m, i) => {
        const drop = m.grade?.drop ?? 0;
        const cls = m.book ? 'b' : m.grade ? m.grade.class : 'u';
        return (
          <button
            type="button"
            key={i}
            className={`tick ${cls}${i === pos - 1 ? ' cur' : ''}${i >= pos ? ' ahead' : ''}`}
            style={{ height: `${m.book ? 14 : 22 + Math.min(78, drop * 160)}%` }}
            title={`${Math.ceil(m.ply / 2)}${m.side === 'w' ? '.' : '…'} ${m.san}${m.grade ? ` · ${m.grade.class}` : ''}`}
            onClick={() => onSeek?.(i + 1)}
          />
        );
      })}
    </div>
  );
}
