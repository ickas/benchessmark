# Results: Jev, Clef and Clef-flash at chess

Run on 2026-10-06 and 2026-10-07. Three matches of 100 games, one for each pair
of models. Every match plays the same 50 opening lines, once with each model as
white, so every pairing faced the same positions. All three models were reached
through the OpenRouter Decisions API with the same request, and Stockfish 19
graded every move at depth 18.

The games are in [`results/`](../results): a PGN per game, plus each run's
`match.json` (the setup) and `summary.json` (every number below).

The article on these results, with a replay of one game, is at
[ickas.dev](https://ickas.dev/writing/benchmarking-jev-clef-chess).

## The ranking

| match | score | Elo gap, 95% interval | verdict |
| --- | --- | --- | --- |
| Clef vs Jev | 57 – 43 | Clef +49 [+17, +82] | **Clef stronger** |
| Clef-flash vs Jev | 55.5 – 44.5 | Clef-flash +38 [+11, +66] | **Clef-flash stronger** |
| Clef-flash vs Clef | 52 – 48 | Clef-flash +14 [−17, +45] | tie |

**The two Clef models are tied, and both are about 40–50 Elo stronger than Jev.**
Neither interval against Jev reaches 0. The Clef pair's interval does, so 100
games cannot tell them apart.

## Move quality

Each model's figures come from its own match, so they depend on the opponent:
Jev blundered 9.0 times per 100 moves against Clef and 12.5 against Clef-flash.
Compare within a row group, not across them.

| | Jev | Clef | | Jev | Clef-flash | | Clef | Clef-flash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| accuracy | 58.5% | 63.5% | | 54.4% | 58.1% | | 61.7% | 62.6% |
| ACPL | 106 | 101 | | 131 | 125 | | 108 | 107 |
| blunders /100 | 9.0 | 8.7 | | 12.5 | 12.3 | | 9.8 | 10.3 |
| Stockfish's move | 28.7% | 30.5% | | 29.2% | 30.1% | | 31.8% | 31.7% |
| p on Stockfish's move | 0.18 | 0.20 | | 0.18 | 0.19 | | 0.21 | 0.21 |

Accuracy is lichess's game accuracy. ACPL clamps each evaluation at ±1000.

## Calibration is where the models differ most

Each move carries the model's confidence. Grouped by confidence, how often did
the model play Stockfish's move?

| confidence | Jev (vs Clef) | Clef (vs Jev) | Clef-flash (vs Clef) |
| --- | --- | --- | --- |
| 0.0–0.2 | 19.3% (2,002) | 21.0% (2,804) | 21.8% (2,937) |
| 0.2–0.4 | 35.3% (1,016) | 49.1% (352) | 57.7% (298) |
| 0.4–0.6 | 52.3% (373) | 74.5% (165) | 74.0% (177) |
| 0.6–0.8 | 65.4% (81) | 85.4% (96) | 92.7% (124) |
| 0.8–1.0 | 100% (4) | 98.2% (112) | 100% (90) |

Moves in brackets. All three are calibrated in the sense that more confidence
means better moves. The Clef models are sharper: when they are sure, they are
right almost every time, and they are sure about a hundred times a match. Jev
is rarely sure, and spreads its confidence over more moves.

## Speed and cost

| | Jev | Clef | Clef-flash |
| --- | --- | --- | --- |
| latency p50 | 260–318 ms | 400–423 ms | 330 ms |
| latency p95 | 340–434 ms | 647–710 ms | 800–822 ms |
| cost, 100 games | $0.14–0.16 | $0.78–0.79 | $0.28–0.31 |
| tokens per call | ~980 | ~910 | ~860 |

Ranges span the two matches each model played. Latency is end to end through
OpenRouter, measured from one machine in Europe. Costs are billed by OpenRouter, not estimated.

**Clef-flash is the best value:** Clef's chess at about a third of the price.
**Jev is the cheapest and fastest**, and the weakest player.

## Most games are draws

| match | checkmate | threefold | insufficient | stalemate |
| --- | --- | --- | --- | --- |
| Clef vs Jev | 24 | 69 | 7 | 0 |
| Clef-flash vs Jev | 17 | 82 | 0 | 1 |
| Clef-flash vs Clef | 20 | 72 | 8 | 0 |

These are decision models: they read the position once and score the legal
moves, with no search and no plan. The harness plays the most probable move.
In a quiet position a model gives the same answer each time it sees that
position, so the pieces shuffle and the position repeats. The move list is in
every request; no model used it to avoid a repetition.

## What these results do not establish

- **That one model is better at chess in general.** This is one setup: one
  question, one state format, the top move always played, no tool to look ahead.
  Another setup could rank them differently.
- **A ranking between Clef and Clef-flash.** Their interval holds 0.
- **Anything about other builds.** Jev answered as `typesafe/jev-1.13-20260917`
  in every call. Clef and Clef-flash report only their alias, so a silent update
  between or during these runs would not show.
- **That the draws are a property of the models alone.** Playing the top move
  makes a model repeat itself; sampling from the probabilities would give fewer
  draws, and would treat Jev (2 decimals) and Clef (4) differently.
- **That more runs would add evidence.** With the top move always played, a
  rerun of the same openings would likely replay the same games. More openings
  would add evidence; reruns would not.

## Reproducing

```bash
npm run match -- jev clef
npm run match -- jev clef-flash
npm run match -- clef clef-flash
```

Each run costs about $0.40 to $1.10 and takes about two hours, including grading.
