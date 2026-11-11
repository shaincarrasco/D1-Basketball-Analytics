# Flagship product reset — 2026–27

This is the implementation plan and acceptance checklist for the D1 Hoops Analytics flagship reset. The app must remain a free static site hosted on GitHub Pages. Current-season source data is the product's foundation: never substitute demo/sample data into live views.

## 1. Global experience — five steps
1. Establish a restrained design system: typography, spacing, surfaces, borders, semantic colors, and tabular numerals.
2. Rebuild navigation as a clear, responsive application shell with active states, breadcrumbs, and a persistent season context.
3. Make dark and light themes complete, readable, and persistent across reloads.
4. Standardize loading, empty, error, stale-data, and retry states; no silent failures.
5. Add keyboard focus, semantic controls, responsive behavior, and reduced-motion support.

## 2. Overview — five steps
1. Replace placeholder totals with counts derived from published 2026–27 feeds.
2. Show provider freshness, last successful refresh, and explicit data coverage.
3. Surface current-season national team leaders using actual provider records only.
4. Show real recent/upcoming games when a verified game feed exists; otherwise show an honest unavailable state.
5. Add purposeful paths into Teams, Players, Games, and Metrics.

## 3. Teams — five steps
1. Use the current-season provider team records as the source of truth for rankings.
2. Keep the national directory searchable, conference-filterable, and sortable.
3. Display the complete supported metric matrix at once with sticky identity columns.
4. Make every team row open a team detail with provider metrics, game splits, roster and linked player stats.
5. Explain definitions, units, provenance, sample limits, and missing values.

## 4. Players — five steps
1. Use only the published current-season player feed and report its coverage/freshness.
2. Add robust search and sortable leaderboards across the fields actually present.
3. Display broad player stat coverage in a dense but readable table.
4. Make each player open a complete provider-stat profile with provenance and missing-value treatment.
5. Link player profiles to their teams and support filters without inventing bio/stat fields.

## 5. Games — five steps
1. Add a season-scoped game feed and publish a timestamped JSON snapshot.
2. Validate and normalize game IDs, dates, participants, scores, and status from provider fields.
3. Add search, date/status filters, and sorting for the schedule/results list.
4. Add game details and connect both teams to their profiles.
5. If box-score or play-by-play data is absent, say so explicitly rather than manufacturing it.

## 6. Metrics & research — five steps
1. Build a complete searchable glossary from supported metric definitions.
2. Distinguish provider-supplied ratings from locally calculated statistics.
3. Publish formulas, units, directionality, caveats, and source coverage.
4. Make team metric comparisons possible through the full sortable matrix.
5. Mark unavailable research areas (lineups, on/off, shot quality, calibrated forecasts) as not yet supported.

## 7. Data & reliability — five steps
1. Make the build fail clearly when required feeds are structurally invalid; preserve optional-feed warnings.
2. Validate current-season player, team, and game JSON before publishing.
3. Respect CBBD request caps and free-tier monthly call limits; avoid unnecessary polling.
4. Add visible feed status and resilient retry/empty/error states in the app.
5. Run production build/typecheck and independently review the deployed artifact and data snapshot before calling it complete.

## Expert acceptance review
- No demo/sample content appears in production sections.
- Every visible statistic is traceable to a provider field or documented formula.
- All visible controls work with keyboard and pointer.
- No section silently renders empty when its feed fails.
- Dark and light modes are legible and coherent.
- Responsive layouts work at narrow and wide viewports.
- GitHub Pages remains the only hosting target.
- Any unverified item is reported as unverified, not marked complete.
