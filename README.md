# benchessmark

Chess as a benchmark for decision models. Two models play each other from a fixed
set of openings, Stockfish grades every move, and a viewer replays any game — or
renders it to an MP4.

It starts with **Jev** (TypeSafe) against **Clef** (Cloudflare). Both are System One
decision models: they do not write text, they score options. Each turn the legal
moves are the options, so a model can never play an illegal move.

The plan this was built from is in [docs/plan.packed.html](docs/plan.packed.html).

## Requirements

- Node 20.12 or later
- An OpenRouter key, for the model players (`OPENROUTER_API_KEY`)
- Stockfish, for grading: `brew install stockfish`
- ffmpeg and Playwright's Chromium, for video only: `brew install ffmpeg`, `npx playwright install chromium`

```bash
npm install
cp .env.example .env.local   # then paste your key
```

## Running

```bash
npm run match -- jev clef            # 100 games: 50 openings × 2 colours
npm run match -- jev clef --games 10
npm run summary                      # the latest run
npm run grade -- runs/<run> --depth 22 --force   # grade again, deeper
npm run viewer                       # http://localhost:5173
npm run video -- runs/<run>/g017.json
npm test
```

Players: `jev`, `clef`, `clef-flash` (see `src/models.ts`), plus two code players
that anchor the scale: `random` and `stockfish-<elo>` (1320 is the lowest).

## A fair setup

Neither API has an effort, temperature or seed setting, so fairness lives in the
harness, in one shared setup (`src/setup.ts`):

- **One endpoint.** Both models go through the OpenRouter Decisions API, so the
  network path is the same and cost is billed, not estimated.
- **One request.** Before game 1 the runner builds each player's first request and
  stops if anything but the model id differs. The setup check prints both side by side.
- **One rule.** The harness plays the most probable legal move; a seeded draw breaks
  ties. The API's own `choice` is not used.
- **Both colours.** Every opening is played twice, once with each model as white.

Three differences no setting removes are printed by the setup check and kept in
every game record: Jev rounds probabilities to 2 decimals and Clef to 4; Clef
reports no build version; and Clef's serving stack reads only about 2K tokens of
state (every turn checks the state stays under 1,500).

## What is recorded

One JSON file per game (and a PGN copy) in `runs/<run>/`, written after every move.
For each move: the position, the number of legal moves, every option's probability,
confidence, ties at the top, latency, retries, tokens, billed cost, the model build
that answered, and Stockfish's grade (centipawns before and after, best move, win-chance
drop, accuracy, class).

The summary reports score, W/D/L, the Elo gap with a 95% interval, lichess-style
accuracy, ACPL, blunders per 100 moves, best-move rate, the probability each model
put on Stockfish's move, calibration by confidence, latency p50/p95, tokens and cost.

## Adding a model

A System One model on OpenRouter is one entry in `src/models.ts`. A chat model
(GPT, Claude) writes text, so it needs its own `Player` in `src/players/`.

## Layout

```
src/
  client/     OpenRouter Decisions client, copied from battleship-vs-jev
  game/       the request, the move pick, one turn, one game
  players/    model, random and Stockfish players behind one interface
  match/      openings, the setup check, the match runner
  analysis/   Stockfish, grading, accuracy, Elo, the summary
  record/     the game record and its writer
viewer/       React replay viewer (Vite); record mode for video
scripts/      export-video.ts, build-openings.ts
data/         50 opening lines, named from lichess-org/chess-openings (CC0)
```

## Licence

MIT
