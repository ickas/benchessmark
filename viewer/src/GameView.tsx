import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Chess } from 'chess.js';
import type { GameRecord, MoveRecord, Side } from '../../src/record/types.js';
import { Board, type Arrow } from './Board.js';
import { EvalBar } from './EvalBar.js';
import { MoveList } from './MoveList.js';
import { PlayerCard } from './PlayerCard.js';
import { Timeline } from './Timeline.js';
import { candidates, derive, formatEval, formatUsd, playerOf, resultText, sideStats } from './derive.js';
import { DEFAULT_TIMING, frameAt, frameKey, makeSchedule, msForPos, type Frame } from './replay.js';
import { useGame } from './useGame.js';

declare global {
  interface Window {
    /** Set in record mode, for scripts/export-video.ts. */
    replay?: { durationMs(): number; renderAt(ms: number): Promise<string> };
  }
}

interface GameViewProps {
  path: string;
  /** Opened by the video export: frames come from renderAt, not from a clock. */
  record: boolean;
  moveMs: number;
}

interface MatchInfo {
  games: number;
}

const SPEEDS = [750, 1500, 3000];
const moveNumber = (m: MoveRecord) => `${Math.ceil(m.ply / 2)}${m.side === 'w' ? '.' : '…'}`;
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function GameView({ path, record: scripted, moveMs }: GameViewProps) {
  // The export reads the file once: frames must not change under it.
  const { record, error } = useGame(path, !scripted);
  const [pos, setPos] = useState<number | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS.includes(moveMs) ? moveMs : 1500);
  const [rec, setRec] = useState(scripted);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const runDir = path.replace(/\/[^/]+$/, '');

  useEffect(() => {
    fetch(`/${runDir}/match.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: MatchInfo | null) => setMatch(m))
      .catch(() => setMatch(null));
  }, [runDir]);

  const derived = useMemo(() => (record ? derive(record) : null), [record]);
  const timing = useMemo(() => ({ ...DEFAULT_TIMING, moveMs: speed }), [speed]);
  const schedule = useMemo(() => (record ? makeSchedule(record.moves, timing, rec) : null), [record, timing, rec]);
  const n = record?.moves.length ?? 0;

  // A finished game opens at the start; a running one follows its last move.
  useEffect(() => {
    if (record && pos === null && record.termination) setPos(0);
  }, [record, pos]);
  const shownPos = pos ?? n;

  /* ── the play clock ── */
  const clock = useRef<{ wall: number; raf: number } | null>(null);
  const stop = useCallback(
    (at?: number) => {
      if (clock.current) cancelAnimationFrame(clock.current.raf);
      clock.current = null;
      setPlaying(false);
      setFrame(null);
      if (at !== undefined) setPos(at);
    },
    [],
  );

  const play = useCallback(
    (fromPos: number) => {
      if (!schedule) return;
      // From the title card at the start; from the start again at the end.
      const start = fromPos === 0 || fromPos >= n ? 0 : msForPos(fromPos, schedule);
      const wall = performance.now() - start;
      const tick = () => {
        const ms = performance.now() - wall;
        const f = frameAt(ms, schedule);
        setFrame(f);
        if (ms >= schedule.total) {
          // A recording ends on the result card; the board view ends on the board.
          if (rec) {
            if (clock.current) cancelAnimationFrame(clock.current.raf);
            clock.current = null;
            setPlaying(false);
            setPos(n);
          } else stop(n);
          return;
        }
        clock.current = { wall, raf: requestAnimationFrame(tick) };
      };
      setPlaying(true);
      clock.current = { wall, raf: requestAnimationFrame(tick) };
    },
    [schedule, rec, n, stop],
  );

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(() => {
    if (playing) {
      if (clock.current) cancelAnimationFrame(clock.current.raf);
      clock.current = null;
      setPlaying(false);
      setPos(frame?.pos ?? shownPos);
      // Paused on a card: keep the card on screen.
      if (!frame || frame.phase === 'play') setFrame(null);
    } else {
      setFrame(null);
      play(shownPos);
    }
  }, [playing, frame, shownPos, play, stop]);

  const seek = useCallback(
    (p: number) => {
      stop(Math.max(0, Math.min(n, p)));
    },
    [n, stop],
  );

  /* ── keyboard ── */
  useEffect(() => {
    if (scripted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight') seek((frame?.pos ?? shownPos) + 1);
      else if (e.key === 'ArrowLeft') seek((frame?.pos ?? shownPos) - 1);
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(n);
      else if (e.key === ' ') toggle();
      else if (e.key === 'r' || e.key === 'R') {
        stop(0);
        setRec((v) => !v);
      } else if (e.key === 'Escape' && rec) {
        stop(0);
        setRec(false);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scripted, seek, toggle, stop, frame, shownPos, n, rec]);

  // Record mode by hand (R): play from the title card once the stage is up.
  const autoplayed = useRef(false);
  useEffect(() => {
    if (!rec || scripted) {
      autoplayed.current = false;
      return;
    }
    if (!autoplayed.current && schedule) {
      autoplayed.current = true;
      play(0);
    }
  }, [rec, scripted, schedule, play]);

  /* ── the export hook ── */
  useEffect(() => {
    if (!scripted || !schedule) return;
    window.replay = {
      durationMs: () => schedule.total,
      renderAt: async (ms: number) => {
        const f = frameAt(ms, schedule);
        flushSync(() => setFrame(f));
        await nextPaint();
        return frameKey(f);
      },
    };
    return () => {
      delete window.replay;
    };
  }, [scripted, schedule]);

  /* ── the frame on screen ── */
  const f: Frame = frame ?? { phase: 'play', pos: shownPos, arrows: true, slide: null };
  const p = Math.min(f.pos, n);
  const fen = derived?.fens[p] ?? new Chess().fen();
  const check = useMemo(() => kingInCheck(fen), [fen]);

  if (error && !record) return <div className="app message">{error}</div>;
  if (!record || !derived) return <div className="app message">Loading {path}…</div>;

  const moving = f.slide ? record.moves[f.slide.index] : undefined;
  const next = record.moves[p];
  const last = record.moves[p - 1];
  const mover: Side = next?.side ?? (record.moves.length % 2 === 0 ? 'w' : 'b');
  const arrows: Arrow[] =
    f.arrows && next && !next.book
      ? candidates(next).list.map((c) => ({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), p: c.p, picked: c.picked }))
      : [];
  const lastOf = (side: Side) => [...record.moves.slice(0, p)].reverse().find((m) => m.side === side);
  const graded = Boolean(record.engine);
  const gameNo = record.gameNo;

  const card = (side: Side) => (
    <PlayerCard
      player={playerOf(record, side)}
      side={side}
      active={p < n && mover === side && f.phase === 'play'}
      next={p < n && mover === side ? next : undefined}
      last={lastOf(side)}
      stats={sideStats(record, side, p)}
      moveNumber={moveNumber}
    />
  );

  return (
    <div className={`app game${rec ? ' rec' : ''}`}>
      <Stage rec={rec}>
        <header className="top">
          {!rec && (
            <a className="brand" href="/">
              benchessmark
            </a>
          )}
          {rec && <span className="brand">benchessmark</span>}
          <span className="dim">
            {record.white.name} vs {record.black.name} · game {gameNo}
            {match ? ` of ${match.games}` : ''}
          </span>
          <span className="chip">
            {record.opening.eco} · {record.opening.name}
          </span>
          {!record.termination && <span className="chip live">LIVE</span>}
          <span className="sp" />
          <span className="dim">
            ply {p} of {n}
          </span>
          <span className="chip">{graded ? `Stockfish ${formatEval(derived.evalWhite[p] ?? null)}` : 'not graded yet'}</span>
          {!rec && <GameNav runDir={runDir} gameNo={gameNo} games={match?.games} />}
        </header>

        {record.termination === 'error' && !rec && (
          <div className="banner">
            Game ended in an error ({record.errorBy === 'w' ? record.white.name : record.black.name}): {record.error}
          </div>
        )}

        <main className="main">
          <EvalBar cp={graded ? (derived.evalWhite[p] ?? null) : null} />
          <div className="bw">
            <Board
              fen={fen}
              lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
              arrows={arrows}
              arrowColor={playerOf(record, mover).color}
              slide={moving && f.slide ? { from: moving.uci.slice(0, 2), to: moving.uci.slice(2, 4), t: f.slide.t } : null}
              check={check}
            />
            {f.phase === 'title' && <TitleCard record={record} games={match?.games} />}
            {f.phase === 'end' && <EndCard record={record} />}
          </div>
          <aside className="side">
            {card('b')}
            <MoveList moves={record.moves} pos={p} opening={record.opening.name} onSeek={seek} />
            {card('w')}
          </aside>
        </main>

        <footer className="tl">
          {!rec && (
            <div className="ctl">
              <button type="button" onClick={() => seek(0)} title="Start (Home)">⏮</button>
              <button type="button" onClick={() => seek(p - 1)} title="Back (←)">◀</button>
              <button type="button" className="play" onClick={toggle} title="Play or pause (space)">
                {playing ? '❚❚' : '▶'}
              </button>
              <button type="button" onClick={() => seek(p + 1)} title="Forward (→)">▶▶</button>
              <button type="button" onClick={() => seek(n)} title="End (End)">⏭</button>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Time for each move">
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s / 1000} s a move
                  </option>
                ))}
              </select>
              <button type="button" className="rec-btn" onClick={() => { stop(0); setRec(true); }} title="Record mode (R)">
                ● Record
              </button>
            </div>
          )}
          <Timeline moves={record.moves} pos={p} onSeek={seek} />
        </footer>
      </Stage>
    </div>
  );
}

/** In record mode the page is a fixed 1920 × 1080 stage, scaled to the window. */
function Stage({ rec, children }: { rec: boolean; children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!rec) return;
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rec]);
  if (!rec) return <div className="stage">{children}</div>;
  return (
    <div className="stage-wrap">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function GameNav({ runDir, gameNo, games }: { runDir: string; gameNo: number; games: number | undefined }) {
  const link = (no: number) => `/?game=${runDir}/g${String(no).padStart(3, '0')}.json`;
  return (
    <span className="nav">
      {gameNo > 1 ? <a href={link(gameNo - 1)}>← g{String(gameNo - 1).padStart(3, '0')}</a> : <span />}
      {games && gameNo < games ? <a href={link(gameNo + 1)}>g{String(gameNo + 1).padStart(3, '0')} →</a> : null}
    </span>
  );
}

function TitleCard({ record, games }: { record: GameRecord; games: number | undefined }) {
  return (
    <div className="overlay title">
      <div className="kicker">benchessmark · game {record.gameNo}{games ? ` of ${games}` : ''}</div>
      <div className="versus">
        <span style={{ color: record.white.color }}>{record.white.name}</span>
        <span className="vs">vs</span>
        <span style={{ color: record.black.color }}>{record.black.name}</span>
      </div>
      <div className="sub">
        {record.white.maker} · white &nbsp;&nbsp;|&nbsp;&nbsp; {record.black.maker} · black
      </div>
      <div className="open">
        {record.opening.eco} · {record.opening.name}
      </div>
      <div className="fine">
        Same request for both · setup #{record.setupHash} · {record.startedAt.slice(0, 10)}
      </div>
    </div>
  );
}

const ENDINGS: Record<string, string> = {
  checkmate: 'by checkmate',
  stalemate: 'Draw by stalemate',
  threefold: 'Draw by threefold repetition',
  insufficient: 'Draw: insufficient material',
  'fifty-move': 'Draw by the fifty-move rule',
  'ply-cap': 'Draw at the 300-ply cap',
  error: 'Ended by an error',
};

function EndCard({ record }: { record: GameRecord }) {
  const winner = record.result === '1-0' ? record.white : record.result === '0-1' ? record.black : null;
  const n = record.moves.length;
  const line =
    record.termination === 'checkmate' && winner ? `${winner.name} wins ${ENDINGS.checkmate}` : ENDINGS[record.termination ?? ''] ?? '';
  return (
    <div className="overlay end">
      <div className="result">{resultText[record.result]}</div>
      <div className="line" style={winner ? { color: winner.color } : undefined}>
        {line}
      </div>
      <div className="grid">
        {(['w', 'b'] as const).map((side) => {
          const s = sideStats(record, side, n);
          const pl = playerOf(record, side);
          return (
            <div key={side} className="col">
              <div className="who" style={{ color: pl.color }}>
                {pl.name}
              </div>
              <div>accuracy <b>{s.accuracy !== undefined ? `${Math.round(s.accuracy)}%` : '–'}</b></div>
              <div>ACPL <b>{s.acpl !== undefined ? Math.round(s.acpl) : '–'}</b></div>
              <div>best move <b>{s.bestRate !== undefined ? `${Math.round(s.bestRate * 100)}%` : '–'}</b></div>
              <div>p50 <b>{s.p50 !== undefined ? `${s.p50} ms` : '–'}</b></div>
              <div>cost <b>{s.costUsd !== undefined ? formatUsd(s.costUsd) : '–'}</b></div>
            </div>
          );
        })}
      </div>
      <div className="fine">{n} plies · graded by {record.engine ? `${record.engine.name}, depth ${record.engine.depth}` : '–'}</div>
    </div>
  );
}

function kingInCheck(fen: string): string | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === turn) return sq.square;
  return null;
}
