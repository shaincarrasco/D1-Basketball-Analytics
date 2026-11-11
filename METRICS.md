# Analytics methodology

## Core team metrics
- Offensive efficiency: points scored per 100 possessions.
- Defensive efficiency: points allowed per 100 possessions (lower is better).
- Net efficiency: offense minus defense.
- Tempo: possessions per 40 minutes.
- eFG%: (FGM + 0.5 × 3PM) / FGA.
- Turnover rate: turnovers / estimated possessions.
- Offensive rebound rate: ORB / (ORB + opponent DRB).
- Free-throw rate: FTA / FGA.

## Adjustments
A production adjusted efficiency model should estimate opponent strength and venue effects across the complete schedule, ideally using an iterative rating model or a regularized regression. Publish model version, training window, data source, uncertainty and minimum sample rules. A team's net rating is not comparable across providers unless definitions and adjustments match.

## Player analytics
Expose per-game, per-40 and per-possession rates; usage; true shooting; assist rate; turnover rate; rebound rates; steal/block rates; and role/position context when inputs are complete. Advanced impact metrics require lineup, substitution, play-by-play or plus/minus coverage and should be withheld when unsupported.

## Lineups and on/off
Only calculate lineup stints when substitutions and player participation can be reconciled to game clocks. Validate five-player units, stint durations and score changes. Label small-sample lineup estimates and suppress unstable units.

## Forecasting and résumé
Game forecasts should be calibrated on historical data with time-based validation, explicit uncertainty intervals and no leakage from future games. Résumé tools should document opponent quality, location, result, margin and date; do not present an unofficial metric as an NCAA selection committee metric.

## Transparency
Every chart/table should show season, date updated, provider, coverage, sample size and a tooltip or glossary definition. Null is missing, not zero. Demo fixtures must never appear as live analytics.


## Team leaderboard coverage (2026–27)

The national team leaderboard separates provider-published ratings from calculations made from season aggregates.

### Provider-published ratings
- Adjusted offensive efficiency (AdjO), adjusted defensive efficiency (AdjD), adjusted net efficiency, SRS and Elo are displayed only when the provider supplies them.
- These are not replaced with raw efficiency calculations when missing.

### Calculated from team and opponent season totals
- Estimated possessions: FGA − offensive rebounds + turnovers + 0.475 × FTA.
- Offensive efficiency: points / estimated possessions × 100.
- Defensive efficiency: opponent points / opponent estimated possessions × 100.
- Net efficiency: calculated offensive efficiency − calculated defensive efficiency.
- eFG%: (FGM + 0.5 × 3PM) / FGA.
- Opponent eFG% uses the same formula on opponent totals.
- Offensive rebound rate: ORB / (ORB + opponent DRB).
- Defensive rebound rate: DRB / (DRB + opponent ORB).
- Turnover rate: turnovers / estimated possessions.
- Free-throw rate: FTA / FGA.
- Opponent versions of turnover rate, offensive rebound rate and free-throw rate.
- Points per possession, opponent points per possession, scoring margin per game, assist-to-turnover ratio and steals per 100 estimated possessions.

### Important coverage limits
The pipeline fetches CBBD game-level team box scores in four date partitions to stay below the endpoint’s 3,000-row-per-request cap; each partition logs a warning if it reaches that limit. Where the game rows contain scores, venue flags and possession counts, the leaderboard calculates home/away/neutral win rates and scoring margins, last-five record and efficiency, and season game-to-game scoring/efficiency volatility. Strength of schedule is the average published SRS of the opponents in the returned game rows.

Opponent-specific shooting splits still require validated matchup-level shot data. Lineup/on-off impact requires substitution and play-by-play coverage; calibrated forecasts require a separate historical model with time-based validation and uncertainty intervals. Those are not presented as available merely because a game box score exists. Game-level metrics inherit the provider's per-partition coverage cap and missing-record limitations; any partition reaching the cap must be split further before full-season coverage is claimed. Do not label raw efficiency as adjusted efficiency, and do not invent values when source fields are absent.


## Division I scope

The current-season team, player, and game snapshots are filtered against a canonical Division I conference allowlist, including common provider naming variants. Records outside that conference set are excluded from the national rankings and player index. A D-I vs. non-D-I matchup remains in the schedule when either participating team belongs to a recognized D-I conference; game-level team box scores retain the D-I side only.
