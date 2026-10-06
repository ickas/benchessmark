import { useLayoutEffect, useRef } from 'react';
import type { MoveRecord } from '../../src/record/types.js';

const MARK: Record<string, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };

interface MoveListProps {
  moves: MoveRecord[];
  /** Moves applied to the board. The highlighted move is the last applied. */
  pos: number;
  opening: string;
  onSeek?: (pos: number) => void;
}

export function MoveList({ moves, pos, opening, onSeek }: MoveListProps) {
  const box = useRef<HTMLDivElement>(null);
  const rows: [MoveRecord | undefined, MoveRecord | undefined, number][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const first = moves[i]!;
    if (first.side === 'b') {
      rows.push([undefined, first, Math.ceil(first.ply / 2)]);
      i -= 1;
      continue;
    }
    rows.push([first, moves[i + 1], Math.ceil(first.ply / 2)]);
  }
  const bookTo = moves.filter((m) => m.book).length;

  // Keep the current move in view. scrollTop, not scrollIntoView: it must not
  // move the page, and a recorded frame must not depend on smooth scrolling.
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.cur');
    const list = box.current;
    if (!el || !list) return;
    // .list is the offset parent, so offsetTop is already relative to it.
    const top = el.offsetTop;
    if (top < list.scrollTop + 8 || top > list.scrollTop + list.clientHeight - 40) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }, [pos]);

  const cell = (m: MoveRecord | undefined) => {
    if (!m) return <span className="mv empty">…</span>;
    const index = m.ply - 1;
    const mark = m.grade ? MARK[m.grade.class] : undefined;
    return (
      <button
        type="button"
        className={`mv${m.book ? ' bk' : ''}${index === pos - 1 ? ' cur' : ''}${index >= pos ? ' ahead' : ''}`}
        onClick={() => onSeek?.(index + 1)}
      >
        {m.san}
        {mark && <em className={m.grade!.class}>{mark}</em>}
      </button>
    );
  };

  return (
    <section className="card moves">
      <div className="mh">
        <span>Moves</span>
        <span className="dim">{bookTo ? `${opening} · book to ply ${bookTo}` : opening}</span>
      </div>
      <div className="list" ref={box}>
        {rows.map(([w, b, n]) => (
          <div className="mr" key={n}>
            <span className="n">{n}.</span>
            {cell(w)}
            {cell(b)}
          </div>
        ))}
      </div>
    </section>
  );
}
