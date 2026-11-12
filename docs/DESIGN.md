# D1 Hoops design + code contract

## Look: flat, editorial, data first
- Surfaces are flat: `bg-night` page, `deck` panels with a 1px `border-line`, 8–10px radius, no gradients, glows or decorative motifs.
- One typeface, Archivo. Body text is normal width; `font-display` narrows it for numerals and scores (weights capped in CSS so big numbers stay crisp).
- Page titles ~2rem bold, section headings `.h-section` ~17px semibold. Big numerals only where the number is the point (scores, ranks, projections).
- Colour only carries meaning: `off` orange = offence, `def` blue = defence (away/first team blue, home/second team orange in head-to-heads), `win`/`loss` and the heat tints = good/bad, `hot` magenta = upsets and live games. Team names stay ink.
- Copy is short: one line under a page title, explanations in tooltips (`title`) or the methodology page. No ALL-CAPS labels, no "→" buttons.
- Light and dark themes come from RGB channel variables in globals.css; never hard-code hex colours in components.

## Building blocks (src/components, src/lib)
- `PageHeader` – page title + one-paragraph intro + optional actions.
- `DataTable<T>` – sortable table with sticky identity columns, CSV export, incremental rendering (`pageSize`). Columns: `{ key, label, value, render?, first?, align?, group?: "off"|"def", sticky?, width? }`.
- `TeamLogo`, `PerfBars` (game-form bars), `WinProb` (split probability bar), `StatBar` (stat + national-rank meter), `Loading` / `ErrorState` / `Empty`.
- `heat(rank, total)` / `heatPct(p)` give the mint/rose cell tint; `fmt`, `signed`, `pctFmt`, `dayLabel`, `timeLabel`, `etToday` in `lib/format.ts`.
- Utility classes in `globals.css`: `.deck`, `.chip` (+ `aria-pressed="true"`), `.btn`, `.btn-primary`, `.field`, `.dt`, `.rank-cell`, `.sub-rank`, `.h-section`, `.label`, `.link`, `.scroll-x`, `.live-dot`.

## Data
- Build-time (server components): `lib/server-data.ts` → `getMeta()`, `getTeams()`, `getConferences()`, `getPlayers()`, `getTeam(slug)`, `getTeamDetail(slug)`.
- Runtime (client components): `useJson<T>(file)` from `lib/client-data.ts`, files under `public/data/app/`: `meta.json`, `teams.json`, `conferences.json`, `players.json` (columnar → `playerRows()`), `team/<slug>.json`, `games/index.json`, `games/<yyyy-mm-dd>.json` (Eastern dates).
- Types for all of it: `lib/types.ts`. Matchup projections: `project()` in `lib/predict.ts`.
- Null is missing, never zero. Show "—".

## Routes
`/` home · `/rankings/` · `/teams/[slug]/` · `/games/` (`?d=YYYY-MM-DD&g=<gameId>`) · `/players/` · `/player/?id=` · `/matchup/?a=<slug>&b=<slug>&site=a|b|n` · `/conferences/` · `/conferences/[slug]/` · `/methodology/`.
Static export (`output: "export"`, `trailingSlash: true`): every link ends in `/`; query-param pages must wrap `useSearchParams` users in `<Suspense>`; dynamic segments need `generateStaticParams` + `export const dynamicParams = false`; `params` is a Promise.

## Quality floor
Mobile first (390px wide, bottom tab bar covers the last 80px — the shell pads for it), visible keyboard focus, real `<button>`/`<a>`, labelled inputs, `prefers-reduced-motion` respected, no console errors.
