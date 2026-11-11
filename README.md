# D1 Hoops

Free, transparent analytics for every NCAA Division I men's basketball team: opponent-adjusted power ratings, walk-forward game predictions with a live backtest, team scouting pages, player leaderboards, a matchup simulator and conference standings.

**Live site:** https://shaincarrasco.github.io/D1-Basketball-Analytics/

## What's in it
| Page | What it does |
|---|---|
| Home | Tonight's slate ranked by watchability, DHR top 25, model scorecard, biggest upsets, leaders |
| Rankings | All D-I teams in four views (ratings, four factors, shooting, résumé), conference filter, CSV |
| Team pages | Rating profile with national ranks, game-by-game adjusted performance, full schedule with win probabilities, roster, résumé quadrants, statistical comps |
| Games | Day-by-day scoreboard with projections, filters, upset flags and box-score detail |
| Players | Leaderboards with presets, filters, percentiles; player profiles with shot diet |
| Matchup | Project any two teams on any floor |
| Conferences | Strength rankings, depth chart, standings with projected records |
| Methodology | How DHR v2 works, live calibration, glossary |

## How it works
1. GitHub Actions (daily at 11:30 UTC, on demand, and on `[refresh-data]` commits) pulls season data from [College Basketball Data](https://collegebasketballdata.com) with the `CBBD_API_KEY` secret.
2. `scripts/build-power-ratings.mjs` fits DHR v2 and writes walk-forward predictions + backtest to `public/data/model-2027.json`.
3. `scripts/build-app-data.mjs` (runs automatically before `next build`) turns the raw feeds into compact page data under `public/data/app/`.
4. Next.js exports a static site to GitHub Pages; team pages are pre-rendered.

Method details: [METRICS.md](./METRICS.md). Design + code conventions: [docs/DESIGN.md](./docs/DESIGN.md).

## Run locally
```bash
npm install
npm run data   # re-fit ratings + rebuild page data from the committed snapshots
npm run dev    # http://localhost:3000
```
`npm run build` produces the static site in `out/`.
