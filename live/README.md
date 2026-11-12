# D1 Hoops live relay (Rust)

A small server that gets live scores to the site faster and cheaper than every browser polling ESPN on its own.

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
Or `docker build -t d1hoops-live live && docker run -p 8080:8080 d1hoops-live`. It is a single ~5 MB binary and runs on any small host (Fly.io, Railway, a $5 VPS).

## Connect the site
Set a repository **variable** `LIVE_URL` (Settings → Secrets and variables → Actions → Variables) to the relay's public URL, e.g. `https://d1hoops-live.fly.dev`. The next deploy bakes it in as `NEXT_PUBLIC_LIVE_URL`; the site then streams today's games from the relay and falls back to polling ESPN directly if the relay is unreachable.
