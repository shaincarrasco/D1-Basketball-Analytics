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
