# Sport kit: rankings and charts for any sport

The player rankings (`/players/rankings/`), chart gallery (`/charts/`), chart builder (`/charts/build/`) and the player page's "Where he ranks" block all run on one sport-agnostic engine in `src/sport-kit/`. Everything that is specific to a sport lives in a **sport pack** under `src/sports/<id>/`.

Four packs exist today:

| Pack | Data | Stats | Ranking lenses | Charts |
|---|---|---|---|---|
| `basketball` | live (players.json) | 40 | 10 | 21 |
| `soccer` | sample only | 33 | 9 | 19 |
| `football` | sample only | 35 | 9 | 17 |
| `tennis` | sample only | 28 | 9 | 16 |

See every pack running at **`/lab/sports/`** (sample data, not linked from the nav, not indexed).

## Layout

```
src/sport-kit/          the engine (no sport knowledge)
  types.ts              SportPack<R> contract: read this first
  metrics.ts pool.ts    values, sample guards, filters, subtitles
  rank.ts               percentile blends, small-sample shrink, tiers
  spec.ts               chart specs and their URL encoding
  validate.ts           conformance rules for packs
  fixtures.ts           seeded random + fake names for sample rows
  ui/                   charts, builder, gallery, rankings board, profile block
  *.test.ts             run with `npm test`

src/sports/<id>/
  types.ts              the row type R (one player's season)
  pack.ts               the SportPack: stats, filters, frameworks, charts, wording
  fixtures.ts           deterministic fictional rows
  index.ts              exports { pack, fixtures } (pure, no React)
  data.ts   (live only) hook returning SportData<R> from the real feed
  ui.tsx    (live only) binds the pack + data to the kit pages
src/sports/registry.ts  packs shown on /lab/sports/
```

## Add a sport in five steps

1. **Scaffold.** `npm run new-sport -- hockey "College hockey"`. This creates `src/sports/hockey/` with a starter pack that already passes every test, and adds it to the lab.
2. **Row type.** Replace `types.ts` with the fields your data source provides: raw season totals, not rates. Rates are computed in each metric's `get`.
3. **Pack.** In `pack.ts`, replace the starter stats, filters, frameworks and charts. Keep `npm test` green while you edit (`SPORT=hockey npm test` checks just this pack).
4. **Fixtures.** Make `fixtures.ts` look like the sport (position differences, realistic ranges) so the lab charts read correctly. Names come from `fakeName()` and are obviously fictional.
5. **Go live (when there's real data).** Add `data.ts` (a hook returning `SportData<R>`, see `src/sports/basketball/data.ts`) and `ui.tsx` (see `src/sports/basketball/ui.tsx`), then point new routes at those components.

## Rules the validator enforces

`validatePack` (run by `npm test` on every pack, with its fixtures) fails on:

- Metric keys that are duplicated, not alphanumeric, in an undeclared group, or with a `short` label longer than 9 characters or no description.
- Filter keys that collide with engine URL parameters (`t x y sz q c hc lb ids m ti n sp fw w rel raw sport view`), or defaults that aren't one of the options.
- A pack with positions but no `pos` filter (use `positionFilter`).
- Frameworks that reference unknown stats, have zero weights or use the reserved key `custom`.
- Tiers that aren't sorted or don't end with `min: 0`.
- Presets in undeclared sections, on unknown stats, colored by position/group when the pack has none, with filter values that aren't options, or with quadrant captions over 32 characters.
- Sample rows whose accessors throw, return non-numbers or use undeclared positions.

The conformance suite also checks that every stat has data, every framework ranks a real field (best first, top player in the top tier), every preset draws at least 10 points, and every chart survives a URL round trip.

## Design choices worth knowing

- **Raw totals in, rates out.** Packs store totals and compute rates in `get`, so sample guards (`ok`) can look at attempts.
- **Sample guards over outliers.** A value whose `ok` fails is treated as missing: left out of charts, pools and blends. It is never drawn as an extreme.
- **"Better" is always up or right.** `invert: true` flips axes and percentiles for stats where lower is better.
- **Exposure drives the small-sample shrink.** `entity.exposure` (minutes, matches, games) pulls blends toward average by `exposure / (exposure + shrinkK)`.
- **Links are forever.** Metric keys and filter keys are URL parameters. Never rename one once shipped. Basketball keeps its original keys (`conf`, `pos`, `min`, `g`, `st`, `c=conf`), so links made before the kit still open.
- **Packs are pure.** `index.ts` never imports React, so tests and tools can load any pack in Node.
