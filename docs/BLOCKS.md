# Building blocks: one repo, many sports sites

D1 Hoops and Baseline (tennis) are two separate sites built from the same blocks. A new sport site is a **pack** (what the sport is) plus a **site** (brand, nav, sport-specific pages). Everything else is shared.

```
packages/
  ui/       @sports/ui     look and feel: palettes + fonts (theme.css), Tailwind preset,
                           site shell (nav, tab bar, slots), colour picker, data table,
                           page header, loading/error states, JSON loading, polling
  kit/      @sports/kit    the engine: SportPack contract, percentiles, ranking lenses,
                           chart specs + share links, validator, conformance tests,
                           and its UI: chart gallery, chart builder, rankings board,
                           "where they rank" block, generic data hook
  packs/    @sports/packs  ready-made sports: tennis, soccer, football
apps/
  tennis/   Baseline       site.tsx + live scores, world rankings, player pages
(repo root) D1 Hoops       the basketball site (moves to apps/hoops later)
scripts/
  new-pack.mjs             npm run new-pack -- <sport> "<Name>"
  new-site.mjs             npm run new-site -- <id> "<Brand>" --pack <sport>
```

## Make a site for a new sport

```bash
npm run new-pack -- hockey "College hockey"            # 1. the sport (stats, lenses, charts)
npm run new-site -- hockey "Biscuit" --pack hockey --accent "#4DE1FF"   # 2. the site
npm install                                            # 3. link the workspace
npm run dev -w @sites/hockey                           # 4. run it
```

Both scaffolds produce working code that passes the tests on day one. Then:

1. Replace the starter stats in `packages/packs/hockey/` with real ones (`SPORT=hockey npm test` keeps you honest).
2. Write a fetcher that fills `apps/hockey/public/data/app/players.json` (`{ "rows": [...] }`). See `apps/tennis/scripts/fetch-tennis.mjs`.
3. Add the sport's own pages under `apps/hockey/src/app/` (scores, player pages), composing blocks from `@sports/ui` and `@sports/kit`.
4. Add a build step to `.github/workflows/deploy.yml` (copy the tennis lines).

## How the blocks fit

A site's `src/site.tsx` is the whole wiring:

```tsx
const pack = withEntity(tennisPack, { href: r => `/player/?id=${r.id}` }); // shared pack + site links
<SiteShell config={{ brand, nav, mobile, footer }} picker={<ThemePicker />} />  // shared chrome
<RankingsBoard pack={pack} data={useSportData(pack)} routes={routes} />        // shared engine
```

- **Shell slots.** `SiteShell` takes `brand`, `nav`, `mobile` and `footer`, plus optional `picker`, `account` and `search`. D1 Hoops passes its account button and search, and Baseline doesn't need them yet.
- **Colour picker.** `useSwatches` is optional. D1 Hoops feeds in followed teams' colours.
- **Data.** `useSportData(pack)` loads `players.json`. Sites with richer data, such as basketball joining teams, write their own hook that returns `SportData`.
- **Live.** `usePolledJson(url, ms)` polls a scoreboard and pauses while the tab is hidden.
- **Look.** Every site gets every palette. A site's default accent is one `--bulb-rgb` override (the `--accent` flag).

## Pack rules (enforced by `npm test`)

`validatePack` and `conformance()` run on every pack in `packages/packs/` and on basketball. They fail on any of the following:

- Unknown stats in lenses or presets.
- Filter keys that collide with engine URL parameters.
- Captions over 32 characters.
- Unsorted tiers.
- Stats with no data.
- Lenses that can't rank a real field.
- Charts with fewer than 10 points.
- Share links that don't survive a round trip.

Metric and filter keys are URL parameters, so never rename one after shipping.

## Not shared yet

- **Accounts and Pro billing.** These run through D1 Hoops' live service (`live/`). Making them a block means giving that service a site id.
- **The live relay.** `live/src/relay.rs` hardcodes the ESPN basketball scoreboard URL. Baseline polls ESPN from the browser every 30 seconds instead.
- **D1 Hoops' location.** The site still lives at the repo root. Moving it to `apps/hoops` is a mechanical follow-up that also touches the deploy paths.
