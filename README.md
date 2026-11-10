# D1 Hoops Analytics

An original, data-driven NCAA Division I men's college basketball analytics platform. The goal is broad coverage and transparent, reproducible metrics—not a copy of any proprietary site's code, data, or ratings.

## Product scope

- National, conference, team, player, game and lineup dashboards
- Transparent player-impact and team-strength models
- Box-score, possession, efficiency, shot-profile and play-by-play analytics
- Player comparisons, scouting reports, transfer/recruiting workflows
- Game projections with uncertainty and backtesting
- Historical seasons, source provenance and data freshness indicators

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- PostgreSQL (Supabase-compatible)
- Python analytics jobs (planned)
- Provider adapters with caching, validation and provenance

## Data providers

Adapters are designed to be independently enabled and to respect each provider's terms, rate limits and attribution requirements. Configure credentials server-side only.

| Provider | Intended use | Status |
|---|---|---|
| College Basketball Data (CBBD) | Games, teams, players, stats, play-by-play and recruiting where available | Adapter scaffold |
| NCAA/public statistics | Official schedules, scores and statistics where endpoints are accessible | Research/integration pending |
| CBB Stats | Public advanced ratings and reference context where permitted | Link/reference only; verify reuse terms |
| SportsDataverse / hoopR | Historical datasets and reproducible research | Import workflow planned |
| API-Basketball / API Ninjas | Optional secondary schedule/roster coverage | Optional; plan limits apply |

Do not assume that a public website is a free, stable, unrestricted API. Verify current documentation, quotas, licensing and permitted storage before enabling a provider.

## Quick start

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local`.
3. Set `CBBD_API_KEY` if you have a CBBD key.
4. Run `npm install` and `npm run dev`.

The app runs in demo mode without credentials and clearly labels sample data.

## Environment

See [`.env.example`](.env.example). Never commit API keys or database service-role keys.

## Metrics

All locally computed ratings must publish their formula, inputs, sample-size handling and data timestamp. They are not EvanMiya ratings and should not be represented as such. Early versions use transparent box-score-derived estimates; possession-level models improve when play-by-play data is available.

## Roadmap

- [x] Initial application architecture and design system
- [x] Demo dashboard with sample Division I data
- [x] Provider adapter contract and CBBD server-side scaffold
- [x] Transparent baseline metrics
- [ ] Validate live provider endpoints and quota behavior
- [ ] Persistent database and scheduled ingestion
- [ ] Full national roster / historical data backfill
- [ ] Possession-based player impact and lineup models
- [ ] Calibration, backtesting and projection evaluation
- [ ] Recruiting, transfer portal and admin workflows

## License

Private project. Provider data remains subject to its original license and terms. This repository does not include proprietary EvanMiya data or code.
