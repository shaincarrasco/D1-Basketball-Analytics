# D1 Hoops app server (Rust)

One binary serves the static site, proxies `/auth` to Neon Auth (same origin, so cookies are first-party), runs the `/api` routes (account, follows, picks, Stripe checkout/portal/webhook, web-push alerts) and the live-score relay below. Deploy steps and variables: [docs/DEPLOY.md](../docs/DEPLOY.md).

`src/bin/feeds.rs` is the separate news/injury/preview aggregator the GitHub Action runs.

## Live relay

- Polls ESPN's public scoreboard for today's slate (Eastern time) every **2 s while any game is live**, every 20 s otherwise.
- Trims each game to what the site needs and pushes the slate to every open browser over **Server-Sent Events** the moment anything changes.
- One upstream request serves any number of viewers; browsers get updates within one poll interval of ESPN changing. ESPN's own CDN caches about 7 s, so that is the floor for any service built on this feed.

## Endpoints
| Path | What |
| --- | --- |
| `GET /events` | SSE stream: `slate` event with the full slate now, then one per change |
| `GET /scoreboard` | Latest slate as JSON (`{ day, updated, events }`, ESPN field names) |
| `GET /health` | `ok` |

## Run
```bash
cd live
cargo run --release          # PORT=8080 POLL_LIVE_MS=2000 POLL_IDLE_MS=20000
```
Set `STATIC_DIR=../out` to serve a local build of the site too. In production the root `Dockerfile` builds the site and this server into one image (Railway).

## Game alerts
Each slate change from the relay is checked for alerts to Pro followers of either team, each sent once (`app.sent_alerts` key in brackets):

| Kind (pref key) | When | Default |
| --- | --- | --- |
| `tipoff` | The game starts (`<id>:tip`) | on |
| `halftime` | Halftime score (`<id>:half`) | **off** |
| `close` | Final 4 minutes of the second half or an overtime, within 5 (`<id>:close:<period>`) | on |
| `overtime` | Regulation or an overtime ends level / a new overtime starts (`<id>:ot:<period>`) | on |
| `upsets` | The pregame underdog (under 25% in the D1 Hoops model) leads by 5+ in the second half or overtime (`<id>:upset`) | on |
| `final` | The game ends (`<id>:final`) | on |

A kind missing from a subscription's prefs uses the default above (so subscriptions made before a kind existed get it only if it defaults on). The pregame win probability and the game's deep link come from the exported site's `STATIC_DIR/data/app/games/<Eastern day>.json` (`pred.wp`, `espnId`, team slugs), matched to the ESPN event the same way the site does (event id, then both teams, then one known team). Alerts open `/games/?d=<day>&g=<game id>`, or `/games/` when the game isn't in the site's data (no upset alert then either).

`POST /api/push/prefs { endpoint }` returns the prefs stored for one of the caller's devices; `POST /api/push/subscribe` keeps only known kinds with true/false values.

## Injury alerts
Every 10 minutes the server fetches the injury wire and sends a web-push alert (kind `injury`, click-through `/injuries/`) to Pro followers of the team for each `new` / `worse` / `returned` event from the last 6 hours, once per event (`app.sent_alerts`). Needs `DATABASE_URL` and the VAPID keys; otherwise it stays idle. Users can switch it off with the `injury` alert preference.

| Variable | Default |
| --- | --- |
| `INJURY_FEED_URL` | `https://shaincarrasco.github.io/D1-Basketball-Analytics/data/app/injury-wire.json` |

## Connect the site
Set a repository **variable** `LIVE_URL` (Settings → Secrets and variables → Actions → Variables) to the relay's public URL, e.g. `https://d1hoops-live.fly.dev`. The next deploy bakes it in as `NEXT_PUBLIC_LIVE_URL`; the site then streams today's games from the relay and falls back to polling ESPN directly if the relay is unreachable.
