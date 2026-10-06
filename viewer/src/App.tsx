import { GameView } from './GameView.js';
import { RunList } from './RunList.js';

/** ?game=runs/<run>/g017.json opens a game; no parameter lists the runs. */
export function App() {
  const params = new URLSearchParams(window.location.search);
  const game = params.get('game');
  if (!game) return <RunList />;
  return (
    <GameView
      path={game}
      record={params.get('record') === '1'}
      moveMs={Number(params.get('moveMs') ?? 1500)}
    />
  );
}
