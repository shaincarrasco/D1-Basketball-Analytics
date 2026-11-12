# D1 Hoops design + code contract

## Look: "arena after dark"
- Night-court navy base (`bg-night`, panels `deck` / `bg-deck2`, borders `border-line` / `border-line2`).
- Two neon signal colours with **fixed meaning**: `text-off` / `var(--off)` orange = offence (the ball), `text-def` / `var(--def)` cyan = defence (shot-clock LED). In head-to-head visuals the **away/first team is cyan, home/second team is orange** (see `WinProb`).
- `hot` magenta is reserved for upsets, live games and alerts. `win` mint / `loss` rose for results only.
- Type: `font-display` (Big Shoulders Display, condensed, 800–900 weight) for page titles, section headings (`.h-section`), big numbers and rank numerals. Body/UI is Barlow. Numbers in tables use `.tnum`.
- Boldness lives in big condensed numerals (ranks, scores, projections). Everything else stays quiet: no gradients on panels, no drop shadows, no decorative icons, no ALL-CAPS eyebrow labels, no "→" on buttons, no fade-in-on-scroll.
- Copy: sentence case, plain verbs, say what a number means. Errors say what failed and how to fix it.

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
