# Data source plan

This project is free-first. No provider is assumed to be free, unrestricted, complete, or production-ready without checking its current documentation and terms.

## Candidates to evaluate
| Source | Potential use | Integration status |
|---|---|---|
| College Basketball Data (CBBD) | Teams, schedules, scores, stats, play-by-play where offered | Adapter skeleton; verify current API docs, authentication, endpoints and quota |
| NCAA public pages/APIs | Official schedules, scores, stats and tournament information | Not integrated; verify availability and terms |
| SportsDataIO | Scores, schedules, team/player data | Optional credential; adapter pending; free-tier coverage must be verified |
| API Ninjas | Supplemental sports endpoints if current college coverage exists | Optional credential; validate coverage before use |
| SportsDataverse / hoopR | Historical datasets and research workflows | Research/ETL candidate; check package maintenance and data license |
| School/conference open data | Rosters, bios, releases and schedule context | Manual/provider-specific ingestion; preserve attribution |

## Integration rules
1. Confirm endpoint, schema, quota, attribution and license before shipping an adapter.
2. Store raw responses with provider, fetched timestamp, season and request parameters.
3. Normalize IDs and data types in a dedicated mapper; keep raw provider schema out of UI components.
4. Track missingness and source coverage. Do not infer zero from absent values.
5. Cache aggressively within the provider's allowed terms; implement retry/backoff and rate limiting.
6. Never commit API keys. Use environment variables and server-only routes.
7. Add automated contract tests using sanitized fixture payloads before enabling a provider.
8. Distinguish regular season, postseason, exhibition and neutral-site context.
9. Keep men's and women's competitions separate unless explicitly supported.
10. For lineups/on-off, require reliable substitution events and complete play-by-play; do not fabricate lineups from box scores.
