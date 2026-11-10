# D1 Hoops Analytics

An original, free-first NCAA Division I men's college basketball analytics platform. The goal is broad coverage and transparent, reproducible metrics—not a copy of any proprietary site's code, data, or ratings.

## Live demo

Once the GitHub Pages workflow completes, visit:

**https://shaincarrasco.github.io/D1-Basketball-Analytics/**

GitHub Pages is a static frontend. It currently displays clearly labeled sample data; no live provider feed is represented as connected.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open http://localhost:3000.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the Next.js static export and deploys the `out/` directory on every push to `main`.

In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The workflow needs repository Actions permissions to deploy Pages.

## Product scope

- National, conference, team, player, game and lineup dashboards
- Transparent player-impact and team-strength models
- Box-score, possession, efficiency, shot-profile and play-by-play analytics
- Player comparisons, scouting reports, transfer/recruiting workflows
- Game projections with uncertainty and backtesting
- Historical seasons, source provenance and data freshness indicators

## Data and backend

The static GitHub Pages build cannot run server-side API keys, scheduled ingestion, database writes, or private backend routes. Those capabilities require a separate backend (for example, a hosted Next.js service or API + Postgres). Keep secrets server-side and never put provider keys in `NEXT_PUBLIC_*` variables.

Potential data providers are listed in [DATA_SOURCES.md](./DATA_SOURCES.md). Verify current documentation, quotas, licensing and permitted use before enabling any integration.

## Analytics transparency

All locally computed ratings must publish formulas, inputs, sample-size handling and data timestamps. They are original estimates, not EvanMiya ratings. Demo fixtures are illustrative only.

## Roadmap

See [ROADMAP.md](./ROADMAP.md). The definition of done for a metric includes a verified source, season, formula, coverage, validation and refresh cadence.
