# Product roadmap

## Foundation (committed)
- Dark analytics shell and responsive navigation
- Team explorer with search, conference filter and sortable efficiency metrics
- Player and game sample panels
- Metric glossary and sample-data disclosure
- Typed data contracts, provider adapter boundary and API status route
- Documentation for sources, methodology and roadmap

## Phase 1 — Verified live data
- Confirm CBBD current endpoints and response schemas
- Build tested mappers for teams, rosters, schedules, box scores and player stats
- Add season selector, source/coverage indicators, ingestion cache and error states
- Populate all D-I teams from a verified canonical team directory

## Phase 2 — Deep team and player analytics
- Possession estimates, four factors, adjusted offense/defense and SOS
- Player rate stats, role/position filters, leaderboards and game logs
- Team/player comparison pages and downloadable CSV

## Phase 3 — Play-by-play intelligence
- Shot charts and shot zones when event coordinates exist
- Lineup stints, rotation patterns, on/off splits and matchup combinations
- Play-type and possession-level scouting only where source data supports it

## Phase 4 — Tournament, recruiting and historical
- Résumé explorer, bracket projections and matchup simulator
- Transfer/recruiting tracker with source links and update dates
- Historical seasons, program trends and conference comparisons

## Phase 5 — Product infrastructure
- Supabase/Postgres schema, scheduled ingestion, user accounts and saved dashboards
- Tests, observability, data-quality alerts, rate limiting and provider attribution
- Public deployment, accessibility and performance audit

## Definition of done for a metric
A metric is not "live" until its source, season, definition, coverage, validation and refresh cadence are documented and tested.
