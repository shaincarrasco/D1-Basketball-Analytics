# D1 Hoops design + code contract

## Look: "the gym after dark"
- College basketball, retro and plain, with Apple Sports-style touch patterns: a date strip, followed-team circles, grouped game rows, segmented controls, and swipe actions on ranking rows.
- Type: **Big Shoulders Display** (`font-display`, all h1/h2/`.h-section`) for titles, names and stat values; **Barlow** for body; **Doto** dot-matrix (`.dots`, `<Dots>`) only for ranks and scores, like scoreboard bulbs. `.plate` is the dark scoreboard face behind big bulbs.
- Colour carries meaning: `bulb` = the accent (ranks, scores, active tab, links), `off` = offence, `def` = defence, `win`/`loss` and the heat tints = good/bad, `hot` = upsets and live games. Team colours are identity only (hero band, rings, edge bars).
- Copy is short and factual. "Notes" (`.note`, `lib/notes.ts`) are box-score footnotes generated from real fields; a note that the data can't support is skipped, never padded.

## Colours are themeable
- Every colour is an RGB channel variable set per palette in `src/app/globals.css` (`html[data-palette="arena" | "blacktop" | "hardwood" | "daygame"]`). Never hard-code hex in components; use the Tailwind names (`bg-deck`, `text-ink`, `bg-bulb`, `text-bulb-ink` for accent text) or `var(--…)`.
- `src/lib/theme.ts` lists the palettes and accent swatches the picker (`components/theme-picker.tsx`) offers. Viewers pick a palette (or "Match my device") and any accent colour, including their followed teams' colours; it is saved in localStorage and applied before first paint by `THEME_SCRIPT`.
- To change the default look, edit the `arena` block. To add a palette, add a CSS block and an entry in `PALETTES` (its `mode` sets `data-theme` for light/dark logos).

## Building blocks (src/components, src/lib)
- `PageHeader` – page title + one-paragraph intro + optional actions.
- `DataTable<T>` – sortable table with sticky identity columns, CSV export, incremental rendering (`pageSize`). Columns: `{ key, label, value, render?, first?, align?, group?: "off"|"def", sticky?, width? }`.
- `Dots` / `RankPlate` (scoreboard numerals), `TeamLogo`, `PerfBars` (game-form bars), `WinProb` (split probability bar), `StatBar` (stat + national-rank meter), `Loading` / `ErrorState` / `Empty`.
- `heat(rank, total)` / `heatPct(p)` give the mint/rose cell tint; `fmt`, `signed`, `pctFmt`, `dayLabel`, `timeLabel`, `etToday` in `lib/format.ts`.
- Utility classes in `globals.css`: `.deck`, `.chip` (+ `aria-pressed="true"`), `.seg` (segmented control), `.note`, `.dots`, `.plate`, `.btn`, `.btn-primary`, `.field`, `.dt`, `.rank-cell`, `.sub-rank`, `.h-section`, `.label`, `.link`, `.scroll-x`, `.live-dot`.

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
