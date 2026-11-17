# Deuce — design plan

Product name in the UI: **Deuce** (the free, personal take on a tennis prediction dashboard).
Audience: one bettor-analyst scanning today's matches for edges, then reading a match's brief before deciding.
Primary job: show who the model likes, how sure it is, whether the price is wrong, and *why* — each player's upsides and downsides.
Direction from the user: bold, dark, neon, never generic.

## Concept: night session

A floodlit night match. Deep indigo court surround, white court lines as the structural device, and the two players
owning two neon colours: optic yellow (tennis-ball felt) for player 1, plasma magenta for player 2. Everything about a
match is laid out left-vs-right like the two ends of a court, with the net in the middle.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--night` | `#0B1030` | Page background (indigo, not grey-black) |
| `--court` | `#141B45` | Panels, expanded match |
| `--line` | `#2A3570` | Borders, dividers, empty bar track |
| `--chalk` | `#E8ECFF` | Primary text, court lines (lines at 18% opacity) |
| `--haze` | `#8FA3FF` | Secondary text, meta |
| `--optic` | `#E4FF3C` | Player 1, value flag, focus ring |
| `--plasma` | `#FF4FD8` | Player 2 |
| `--warn` | `#FFB547` | Conflicting signals / risk only |

Neon glow is used sparingly: only on the value flag and the model pick's probability number (`text-shadow: 0 0 18px` of the player colour at 45%).
Radius: 6px for chips and buttons, 14px for the expanded match panel. No drop shadows; depth comes from the court colour step.

Type:
- **Big Shoulders Display** (600/800): player names, probabilities, odds, agreement score — stadium scoreboard numerals, tabular.
- **Schibsted Grotesk** (400/500/600): body, brief text, controls. 15px base, 1.5 line height, brief text max 68ch.
- Scale: 13 / 15 / 18 / 24 / 32 / 48. Sentence case everywhere. No all-caps labels, no monospace, no middle-dot meta strings.

## Layout

```
Deuce        Today | Tomorrow | Wed 18          Men  Women      [ ] Value only
-------------------------------------------------------------------------------
Nitto ATP Finals                                   [Indoor hard]
 16:00   Jannik Sinner    64 ███████████████|██████ 36    Carlos Alcaraz   1.62  2.30  (value)
 18:30   ...
 ┌─ Brief · Profile · Attributes · Odds ────────────────────────────────────────┐
 │  Sinner 64%                     Agreement 52  Mixed signals                  │
 │                                                                               │
 │  SINNER  ◀────────────────────────┃────────────────────────▶  ALCARAZ        │
 │  Fitness & Fatigue                ┃        ●  slight                          │
 │  Motivation & Pressure            ●  level                                    │
 │  Conditions          moderate ●   ┃                                           │
 │  Market                           ┃              ●  moderate                  │
 │                                                                               │
 │  Sinner                           ┃  Alcaraz                                  │
 │  + 71% on indoor hard this year   ┃  + 8-2 in his last 10                     │
 │  − 6 matches in 14 days           ┃  − 2-5 in deciding sets                   │
 │                                                                               │
 │  Bottom line: ...                                                             │
 │  [Fitness & Fatigue ▾] [Motivation ▾] [Conditions ▾] [Market ▾]  (bucket text) │
 └───────────────────────────────────────────────────────────────────────────────┘
```

- Match rows: player 1 left-aligned, player 2 right-aligned, the probability bar between them is a single track split at
  the model probability, optic on the left, plasma on the right, a 2px chalk "net" tick at 50%.
- **The memorable element: the brief "court".** Four bucket rows cross a court with the net in the middle. Each bucket's
  verdict is a puck pushed toward the player it favours: slight = 1 lane, moderate = 2, strong = 3 (lanes = 15% of
  half-width each). Level sits on the net. Puck colour = favoured player's colour. One look shows which way the
  evidence leans and whether it agrees with the model.
- Under the court, upsides/downsides in two columns mirroring the court sides. Upsides marked with the player's colour
  "+", downsides with a chalk "−" at 60% opacity. Every bullet carries its number.
- Bucket texts sit below as four disclosure rows (collapsed by default on mobile, open on desktop).
- Value flag: a small optic ball (circle with the felt seam) next to the side with value, with edge in points on hover.
- Manual odds: two small inputs in the Odds tab; value recomputes instantly.

## Backtest page ("Proof")

The user's second favourite screen: proof that the model has (or hasn't) a real edge against closing odds.

```
Proof                          Edge ≥ [2.0] pts   Prob ≥ [0.00]   Men  Women   Split: All ▾
+$1,184 profit on 36,877 $1 bets          3.08% return per bet    17,725 won    53% avg model prob
┌──────────────────────────────────────────────────────────────────────────────┐
│  cumulative P&L line (optic), Elo-favourite baseline (haze, dashed), split    │
│  boundaries as faint vertical court lines labelled Split 1 / 2 / 3            │
└──────────────────────────────────────────────────────────────────────────────┘
 Return by level          Return by surface         Return by round
 (horizontal bars about zero: optic for positive, plasma for negative, n beside each)
 Calibration: predicted vs actual dots on a diagonal       |   Bets table + CSV download
```
- The headline is a sentence with the numbers in Big Shoulders, not four icon stat cards.
- Filters recompute everything client-side from `bets[]`.
- Negative results are shown just as plainly as positive ones. Small samples (n < 100) are greyed with "small sample".
- Footnote: past results don't guarantee future returns; paper mode.

## Motion

One moment only: when a brief opens, pucks slide from the net to their positions (300ms, ease-out); honoured by
`prefers-reduced-motion`. Everything else is instant.

## Quality floor

Keyboard: rows are buttons, tabs are real tablist, visible optic focus ring. Contrast: haze on night passes AA for text
≥ 15px. Responsive: under 720px the match row stacks names above the bar; the court keeps its layout at full width.
