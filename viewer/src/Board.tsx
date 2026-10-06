import { easeInOut } from './replay.js';

export interface Arrow {
  from: string;
  to: string;
  p: number;
  picked: boolean;
}

interface BoardProps {
  /** The position shown. While a move slides, the position before it. */
  fen: string;
  lastMove: { from: string; to: string } | null;
  arrows: Arrow[];
  arrowColor: string;
  slide: { from: string; to: string; t: number } | null;
  /** The square of a king in check. */
  check: string | null;
}

const SQ = 100;
// One glyph shape for both colours; fill and outline tell them apart.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
const FILES = 'abcdefgh';

function xy(square: string): [number, number] {
  return [FILES.indexOf(square[0]!) * SQ, (8 - Number(square[1])) * SQ];
}

function pieces(fen: string): { square: string; piece: string }[] {
  const out: { square: string; piece: string }[] = [];
  fen.split(' ')[0]!.split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else out.push({ square: `${FILES[f++]}${8 - r}`, piece: ch });
    }
  });
  return out;
}

/** The board as one SVG. Every frame is a function of its props: no CSS transitions. */
export function Board({ fen, lastMove, arrows, arrowColor, slide, check }: BoardProps) {
  const t = slide ? easeInOut(Math.min(1, Math.max(0, slide.t))) : 0;

  return (
    <svg className="board" viewBox="0 0 800 800" role="img" aria-label="Chess board">
      <defs>
        <radialGradient id="check-glow">
          <stop offset="0%" stopColor="#ff3b30" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#e5533d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e5533d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {Array.from({ length: 64 }, (_, i) => {
        const f = i % 8;
        const r = Math.floor(i / 8);
        const square = `${FILES[f]}${8 - r}`;
        const light = (f + r) % 2 === 0;
        const hl = lastMove && (lastMove.from === square || lastMove.to === square);
        return (
          <rect
            key={square}
            x={f * SQ}
            y={r * SQ}
            width={SQ}
            height={SQ}
            className={`sq ${light ? 'l' : 'd'}${hl ? ' hl' : ''}`}
          />
        );
      })}

      {check && <circle cx={xy(check)[0] + SQ / 2} cy={xy(check)[1] + SQ / 2} r={56} fill="url(#check-glow)" />}

      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} className="coords">
          <text x={5} y={i * SQ + 17} className={i % 2 === 0 ? 'on-l' : 'on-d'}>{8 - i}</text>
          <text x={i * SQ + SQ - 6} y={796} textAnchor="end" className={i % 2 === 1 ? 'on-l' : 'on-d'}>{FILES[i]}</text>
        </g>
      ))}

      {pieces(fen).map(({ square, piece }) => {
        let [x, y] = xy(square);
        let opacity = 1;
        if (slide && square === slide.from) {
          const [tx, ty] = xy(slide.to);
          x += (tx - x) * t;
          y += (ty - y) * t;
        } else if (slide && square === slide.to) {
          opacity = 1 - t; // the captured piece fades as the mover lands
        }
        const white = piece === piece.toUpperCase();
        return (
          <text
            key={square}
            x={x + SQ / 2}
            y={y + SQ / 2 + 4}
            className={`pc ${white ? 'pw' : 'pb'}`}
            opacity={opacity}
            style={slide && square === slide.from ? { filter: 'drop-shadow(0 6px 6px rgba(0,0,0,.35))' } : undefined}
          >
            {GLYPH[piece.toLowerCase()]}
          </text>
        );
      })}

      {arrows.map((a) => (
        <ArrowShape key={`${a.from}${a.to}`} arrow={a} color={arrowColor} />
      ))}
    </svg>
  );
}

function ArrowShape({ arrow, color }: { arrow: Arrow; color: string }) {
  const [x1, y1] = xy(arrow.from).map((v) => v + SQ / 2) as [number, number];
  const [x2, y2] = xy(arrow.to).map((v) => v + SQ / 2) as [number, number];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;

  const width = 7 + 15 * Math.sqrt(arrow.p);
  const headLen = width * 2.1 + 6;
  const headHalf = width * 1.35 + 4;
  const tipX = x2 - ux * 12;
  const tipY = y2 - uy * 12;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  const startX = x1 + ux * 22;
  const startY = y1 + uy * 22;
  const opacity = arrow.picked ? 0.92 : 0.5;

  // The label sits on the shaft, just behind the head.
  const labelX = tipX - ux * (headLen + 18);
  const labelY = tipY - uy * (headLen + 18);
  const pct = `${Math.round(arrow.p * 100)}%`;

  return (
    <g opacity={opacity} className="arrow">
      <line x1={startX} y1={startY} x2={baseX} y2={baseY} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <polygon
        points={`${tipX},${tipY} ${baseX - uy * headHalf},${baseY + ux * headHalf} ${baseX + uy * headHalf},${baseY - ux * headHalf}`}
        fill={color}
      />
      <g transform={`translate(${labelX} ${labelY})`}>
        <rect x={-27} y={-15} width={54} height={30} rx={15} className="arrow-label-bg" />
        <text textAnchor="middle" y={6} className="arrow-label" fill={color}>
          {pct}
        </text>
      </g>
    </g>
  );
}
