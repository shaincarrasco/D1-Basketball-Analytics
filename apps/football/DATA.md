# Gridiron data contract

`scripts/fetch-cfb.mjs` writes these files to `public/data/app/`. The site only reads these files (plus ESPN's live scoreboard in the browser). Season: 2026 FBS regular season (`seasontype=2`, weeks 1..current), then postseason (`seasontype=3`) once it exists.

## Field coordinates (used everywhere a spot appears)

`x` = yards from the **offense's own goal line**, 0–100, so the offense always attacks toward 100. From ESPN play `start.yardsToEndzone`: `x = 100 - yardsToEndzone`. A text spot like `AKR49` is converted using which team has the ball: own side `WMU08` → `x = 8`; opponent side `AKR49` → `x = 100 - 49 = 51`; `50` → 50.

## players.json

`{ "updated": ISO, "season": 2026, "rows": FootballRow[] }`. FootballRow is defined in `packages/packs/football/types.ts`. Include every QB/RB/WR/TE/DL/LB/DB with at least one stat. `null` = not applicable (a DB has no passing line). `team.confSlug` is a lowercase slug of the conference name.

## teams.json

`[{ id, name, short, abbr, color, altColor, logo, confSlug, confName, wins, losses, confWins, confLosses, apRank, cfpRank }]`. Colours are `#rrggbb`. Ranks are numbers or null.

## games.json

```
{ "season": 2026, "currentWeek": 12, "weeks": [{ "week": 1, "label": "Week 1", "start": "YYYY-MM-DD", "games": [Game] }] }
Game = { id, date (ISO), status: "pre"|"in"|"post", detail, neutral, venue, tv,
         home: { id, score, rank, winner }, away: { id, score, rank, winner } }
```

## rankings.json

`{ "updated": ISO, "polls": [{ "key": "cfp"|"ap"|"coaches", "name", "date", "ranks": [{ rank, teamId, record, points, firstPlace, previous }] }] }`. Order: CFP first when it exists.

## p/{playerId}.json (one per player in players.json)

```
{ id, games: [{ gid, week, date, opp (team id), home, result ("W 31-24"), stats: { ...that game's box-score line, same keys as FootballRow } }],
  touches: [Touch] }
Touch = { gid, week, q, clock, kind: "rec"|"inc"|"rush"|"throw",
          depth: "short"|"deep"|null, dir: "left"|"middle"|"right"|null,
          los: x, spot: x|null, end: x|null, yds, td, first, int, text }
```

- **`rec`/`inc`:** the receiver's targets. `spot` is the catch spot ("caught at X") or throw spot ("thrown to X"), and `end` is where the play ended.
- **`throw`:** a QB's every attempt, same fields; `int` true for interceptions.
- **`rush`:** every carry. `dir` comes from "rush left/right/middle/up the middle" (up the middle = middle).
- **Air yards** = `spot - los`. **YAC** = `end - spot`.
- **`text`:** the play text without the leading clock.

## g/{gameId}.json (completed games)

```
{ id, home: teamId, away: teamId, drives: [{ team, start: x, end: x, result, yards, plays: [{ q, clock, type, text, down, dist, start: x, end: x, yds, score: boolean }] }] }
```

Drive and play spots are in that drive's offense's coordinates.
