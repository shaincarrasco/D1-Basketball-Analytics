// Paper-bet tracker: would the model's picks have made money against real sportsbook lines?
// A private simulation (flat 1-unit bets, no real money). Nothing here is read by the site, and
// past results never guarantee future ones.
//
// Every run (hourly in CI, idempotent):
//   capture  a game with a posted line and no entry yet is frozen: the line and the model's
//            prediction at that moment. Frozen pregame numbers are never rewritten (no hindsight).
//   close    after the final, ESPN's closing line is stored beside the frozen one (closing-line value).
//   settle   finals are graded; postponed and canceled games are voided.
//   backfill a game first seen after it finished uses the closing line and the model's walk-forward
//            (pregame, out-of-sample) prediction, marked backfilled so it can be read separately.
//
// Inputs:  public/data/games-season-2027.json, public/data/model-2027.json, public/data/team-directory.json,
//          public/data/espn-tv-2027.json, .cache/espn-player-games-2027.json, ESPN scoreboard + summary feeds
// Outputs: .cache/paper-bets-2027.json (ledger) and docs/paper-bets.md (report)
// Flags:   --since=YYYY-MM-DD     first Eastern day to track (default START_DAY)
//          --backfill=YYYY-MM-DD  rebuild the season from closing lines into a separate ledger and
//                                 report (.cache/paper-bets-backfill-2027.json, docs/paper-bets-backfill.md)
//          --dry-run              fetch and compute, write nothing
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isScorelessFinal } from "./lib/game-status.mjs";
import { americanToImplied, buildSummary, closingLineValue, MARKETS, parseEspnLine, selectBets, settleBet } from "./lib/paper-bets.mjs";

const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
const START_DAY = "2026-11-16"; // first Eastern day of live tracking
const LOOKAHEAD_DAYS = 1; // lines are usually posted the day before
const CONCURRENCY = 6;
const TIMEOUT_MS = 25_000;
const MAX_TRIES = 3; // looks for a line/event after the final before a game is written off
const RECENT_BETS = 25;
const LIVE = { ledger: ".cache/paper-bets-2027.json", report: "docs/paper-bets.md" };
const BACKFILL = { ledger: ".cache/paper-bets-backfill-2027.json", report: "docs/paper-bets-backfill.md" };

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const DRY_RUN = process.argv.includes("--dry-run");
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
/** A missing ledger is a first run (null). A damaged one must never be replaced by an empty ledger: the frozen pregame lines in it cannot be captured again. */
const CORRUPT = Symbol("corrupt");
async function readLedger(path) {
  let text;
  try { text = await readFile(path, "utf8"); } catch (error) { return error.code === "ENOENT" ? null : CORRUPT; }
  try { const data = JSON.parse(text); return data && typeof data === "object" && data.entries ? data : CORRUPT; } catch { return CORRUPT; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const etDay = d => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(d));
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** null = could not reach ESPN (try again next run); anything else is ESPN's answer. */
async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json", "User-Agent": "d1-hoops-analytics" } });
    // 403 and 408 are how a rate limit or a proxy hiccup shows up: transient, so they must not count as ESPN's answer.
    if (res.status === 429 || res.status === 403 || res.status === 408 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return { notFound: true };
    return await res.json();
  } catch (error) {
    if (attempt >= 3) { console.warn(`[paper-bets] giving up on ${url}: ${error.message}`); return null; }
    await sleep(800 * attempt);
    return getJson(url, attempt + 1);
  }
}
async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  const backfillFrom = arg("backfill");
  const mode = backfillFrom ? "backfill" : "live";
  const paths = mode === "backfill" ? BACKFILL : LIVE;
  const since = backfillFrom ?? arg("since") ?? START_DAY;
  if (!isDay(since)) { console.warn(`[paper-bets] "${since}" is not a YYYY-MM-DD day; nothing done.`); return; }

  const [gamePayload, model, directory, tv, boxes, previous] = await Promise.all([
    readJson("public/data/games-season-2027.json", null),
    readJson("public/data/model-2027.json", null),
    readJson("public/data/team-directory.json", { teams: [] }),
    readJson("public/data/espn-tv-2027.json", { events: {} }),
    readJson(".cache/espn-player-games-2027.json", { events: {} }),
    readLedger(paths.ledger),
  ]);
  if (previous === CORRUPT) { console.warn(`[paper-bets] ${paths.ledger} is unreadable; left untouched so the frozen lines are not overwritten. Nothing done.`); return; }
  if (!gamePayload?.games || !model?.predictions) { console.warn("[paper-bets] Schedule or model file missing; nothing done."); return; }
  const ledger = previous?.entries ? structuredClone(previous) : { version: 1, season: 2027, mode, entries: {}, skipped: {} };
  ledger.skipped ??= {};
  ledger.since = since;
  const { entries, skipped } = ledger;

  // Same name matching as merge-espn-finals (ESPN directory keyed by location).
  const normName = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ALIASES = { neworleans: "lsuneworleans", stthomasminnesota: "stthomas" };
  const dirByLoc = new Map((directory.teams ?? []).map(t => [normName(t.location || t.displayName), t]));
  const espnIdOf = name => {
    const d = dirByLoc.get(normName(name)) ?? dirByLoc.get(ALIASES[normName(name)] ?? "");
    return d?.id != null ? String(d.id) : null;
  };

  // ESPN events by Eastern day + team id: the committed caches first, scoreboards on top when fetched.
  const events = new Map();
  const addEvent = ev => { if (ev.id && ev.day && ev.homeId && ev.awayId) events.set(String(ev.id), { ...events.get(String(ev.id)), ...ev, id: String(ev.id) }); };
  for (const [id, ev] of Object.entries(tv.events ?? {})) addEvent({ id, day: ev.day, homeId: String(ev.homeId ?? ""), awayId: String(ev.awayId ?? "") });
  for (const [id, ev] of Object.entries(boxes.events ?? {})) {
    const home = (ev.teams ?? []).find(t => t.home), away = (ev.teams ?? []).find(t => !t.home);
    if ((ev.teams ?? []).length === 2 && home && away) addEvent({ id, day: ev.day, homeId: String(home.teamId), awayId: String(away.teamId) });
  }
  let byDayTeam = new Map();
  const reindex = () => {
    byDayTeam = new Map();
    for (const ev of events.values()) for (const teamId of [ev.homeId, ev.awayId]) {
      const key = `${ev.day}:${teamId}`;
      if (!byDayTeam.has(key)) byDayTeam.set(key, []);
      byDayTeam.get(key).push(ev);
    }
  };
  reindex();
  const fetchedDays = new Set();
  async function loadScoreboards(days) {
    await pool(days.filter(d => !fetchedDays.has(d)), async day => {
      const data = await getJson(`${API}/scoreboard?dates=${day.replaceAll("-", "")}&groups=50&limit=400`);
      if (!Array.isArray(data?.events)) { if (data === null) console.warn(`[paper-bets] No scoreboard for ${day}; its games wait for the next run.`); return; }
      fetchedDays.add(day);
      for (const e of data.events) {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === "home"), away = comp?.competitors?.find(c => c.homeAway === "away");
        if (!home || !away || !e.date) continue;
        addEvent({ id: e.id, day: etDay(e.date), homeId: String(home.team?.id ?? home.id), awayId: String(away.team?.id ?? away.id), state: comp.status?.type?.state ?? null, odds: comp.odds?.[0] ?? null, fromScoreboard: true });
      }
    });
    reindex();
  }
  // Prefer an event with both teams; with one side mapped (non-D-I opponent) require a unique match.
  function matchEvent(g, day) {
    const h = espnIdOf(g.homeTeam), a = espnIdOf(g.awayTeam);
    if (!h && !a) return { reason: "unmapped" };
    const on = d => (byDayTeam.get(`${d}:${h ?? a}`) ?? []).filter(ev => !h || !a || ev.homeId === a || ev.awayId === a);
    let cands = on(day);
    // Tip times near midnight can land on the neighbouring Eastern day in one of the two feeds.
    if (!cands.length && h && a) cands = [...on(addDays(day, -1)), ...on(addDays(day, 1))];
    if (cands.length !== 1) return { reason: cands.length ? "ambiguous" : "no-event" };
    const ev = cands[0];
    return { ev, flip: h ? ev.awayId === h : ev.homeId === a };
  }

  const now = new Date().toISOString();
  const today = etDay(now);
  const lastDay = mode === "live" ? addDays(today, LOOKAHEAD_DAYS) : today;
  const games = gamePayload.games.map(g => ({ g, day: etDay(g.date) })).filter(x => x.day >= since && x.day <= lastDay);
  const isFinal = g => g.status === "final" && !isScorelessFinal(g);
  const isOff = g => g.status === "postponed" || g.status === "canceled";
  const gaveUp = id => (skipped[id]?.tries ?? 0) >= MAX_TRIES;
  const prediction = id => {
    const p = model.predictions[id];
    return p && Number.isFinite(p.homeWinProb) ? { homeWinProb: p.homeWinProb, margin: p.margin, homePts: p.homePts, awayPts: p.awayPts, sigma: p.sigma, modelUpdatedAt: model.updatedAt ?? null } : null;
  };
  const newEntry = (g, day, match, line, extra) => ({
    gameId: String(g.id), espnEventId: match.ev.id, day, date: g.date, home: g.homeTeam, away: g.awayTeam, neutralSite: Boolean(g.neutralSite),
    backfilled: false, capturedAt: now, line, model: prediction(g.id), closing: null, ...extra, bets: [], status: "open", result: null,
  });

  // ---------- 1. capture pregame lines (live ledger only) ----------
  let awaitingLine = 0, captured = 0;
  if (mode === "live") {
    const upcoming = games.filter(({ g, day }) => day >= today && !isFinal(g) && !isOff(g) && !entries[g.id]);
    if (upcoming.length) await loadScoreboards([...new Set(upcoming.map(x => x.day))]);
    for (const { g, day } of upcoming) {
      const match = matchEvent(g, day), pred = prediction(g.id);
      // Only a scoreboard event that has not tipped carries a pregame price; in-play numbers are not a pregame line.
      if (!match.ev?.fromScoreboard || match.ev.state !== "pre" || !pred) continue;
      const line = parseEspnLine(match.ev.odds, { flip: match.flip });
      if (!line) { awaitingLine++; continue; }
      entries[g.id] = newEntry(g, day, match, { source: "pregame-scoreboard", capturedAt: now, ...line });
      entries[g.id].bets = selectBets(line, pred);
      delete skipped[g.id];
      captured++;
    }
  }

  // ---------- 2. closing lines for finals: once each, cached in the ledger ----------
  const finals = games.filter(({ g }) => isFinal(g));
  const wantsClose = ({ g }) => { const e = entries[g.id]; return e ? !e.backfilled && !e.closing && (e.closingTries ?? 0) < MAX_TRIES : !gaveUp(g.id); };
  const pending = finals.filter(wantsClose);
  // Days the committed caches cannot map need a scoreboard for their event ids.
  const unmappedDays = [...new Set(pending.filter(({ g, day }) => !entries[g.id] && matchEvent(g, day).reason === "no-event").map(x => x.day))];
  if (unmappedDays.length) await loadScoreboards(unmappedDays);
  let backfilled = 0, closed = 0, unreachable = 0;
  const skip = (g, day, reason, espnEventId = null) => { skipped[g.id] = { day, home: g.homeTeam, away: g.awayTeam, reason, espnEventId, tries: (skipped[g.id]?.tries ?? 0) + 1 }; };
  await pool(pending, async ({ g, day }) => {
    const entry = entries[g.id];
    const match = entry ? null : matchEvent(g, day);
    if (!entry && !match.ev) {
      // No event because the day's scoreboard could not be fetched is an outage, not an answer: it must not use up a look.
      if (match.reason === "no-event" && unmappedDays.includes(day) && !fetchedDays.has(day)) { unreachable++; return; }
      skip(g, day, match.reason);
      return;
    }
    const eventId = entry?.espnEventId ?? match.ev.id;
    const data = await getJson(`${API}/summary?event=${eventId}`);
    if (data === null) { unreachable++; return; }
    // Orientation comes from the summary itself, checked against our own team mapping.
    const comp = data.header?.competitions?.[0];
    const espnHome = comp?.competitors?.find(c => c.homeAway === "home")?.id, espnAway = comp?.competitors?.find(c => c.homeAway === "away")?.id;
    const h = espnIdOf(g.homeTeam), a = espnIdOf(g.awayTeam);
    const straight = (!h || h === espnHome) && (!a || a === espnAway), flipped = (!h || h === espnAway) && (!a || a === espnHome);
    let line = null;
    if (comp?.status?.type?.state === "post" && straight !== flipped) {
      for (const odds of data.pickcenter ?? []) { line = parseEspnLine(odds, { flip: flipped }); if (line) break; }
    }
    if (entry) {
      if (line) { entry.closing = { source: "closing-summary", capturedAt: now, ...line }; closed++; }
      else entry.closingTries = (entry.closingTries ?? 0) + 1;
      return;
    }
    if (!line) { skip(g, day, straight === flipped ? "team-mismatch" : "no-line", eventId); return; }
    if (!prediction(g.id)) { skip(g, day, "no-prediction", eventId); return; }
    const closing = { source: "closing-summary", capturedAt: now, ...line };
    entries[g.id] = newEntry(g, day, { ev: { id: eventId } }, closing, { backfilled: true, closing });
    delete skipped[g.id];
    backfilled++;
  });

  // ---------- 3. settle ----------
  const byId = new Map(gamePayload.games.map(g => [String(g.id), g]));
  for (const entry of Object.values(entries)) {
    const g = byId.get(entry.gameId);
    if (!g) continue;
    // The backfill ledger is a rebuild: its picks always follow the current walk-forward predictions.
    if (mode === "backfill" && isFinal(g)) entry.model = prediction(g.id) ?? entry.model;
    if (mode === "backfill" || !entry.bets.length) entry.bets = selectBets(entry.line, entry.model).map(b => ({ ...b }));
    // A game moved to another date is a different bet: the frozen line no longer applies.
    const moved = Math.abs(Date.parse(`${etDay(g.date)}T12:00:00Z`) - Date.parse(`${entry.day}T12:00:00Z`)) > 864e5;
    if (isOff(g) || moved) {
      entry.status = "void"; entry.result = null;
      for (const b of entry.bets) { b.result = "void"; b.profit = 0; }
    } else if (isFinal(g)) {
      // The line was frozen in the home/away the schedule had then. If the provider has since swapped the sides
      // (neutral sites), grade in the frozen orientation; if the teams no longer match at all, leave it open.
      const same = g.homeTeam === entry.home && g.awayTeam === entry.away, swapped = g.homeTeam === entry.away && g.awayTeam === entry.home;
      if (!same && !swapped) { console.warn(`[paper-bets] ${entry.gameId}: teams changed since capture (${entry.away} at ${entry.home}); not settled.`); continue; }
      const homeScore = same ? g.homeScore : g.awayScore, awayScore = same ? g.awayScore : g.homeScore;
      entry.status = "settled"; entry.result = { homeScore, awayScore };
      entry.settledAt ??= now;
      for (const b of entry.bets) Object.assign(b, settleBet(b, homeScore, awayScore));
    }
    for (const b of entry.bets) {
      b.pick = b.market === "total" ? (b.side === "over" ? "Over" : "Under") : b.side === "home" ? entry.home : entry.away;
      if (!entry.backfilled && entry.closing) b.clv = closingLineValue(b, entry.closing);
    }
  }

  // ---------- 4. summary ----------
  const rows = Object.values(entries).flatMap(e => e.bets.map(b => ({ ...b, backfilled: e.backfilled, day: e.day, date: e.date, game: `${e.away} ${e.neutralSite ? "vs" : "at"} ${e.home}`, score: e.result ? `${e.result.awayScore}-${e.result.homeScore}` : null })));
  const count = fn => Object.values(entries).filter(fn).length;
  const skips = reason => Object.values(skipped).filter(s => (Array.isArray(reason) ? reason.includes(s.reason) : s.reason === reason)).length;
  ledger.stats = {
    gamesInWindow: games.length, finals: finals.length,
    entries: count(() => true), liveCaptured: count(e => !e.backfilled), backfilled: count(e => e.backfilled),
    settled: count(e => e.status === "settled"), open: count(e => e.status === "open"), void: count(e => e.status === "void"),
    withClosing: count(e => !e.backfilled && e.closing),
    noLine: skips("no-line"), unmatched: skips(["unmapped", "no-event", "ambiguous", "team-mismatch"]), noPrediction: skips("no-prediction"),
    awaitingLine, awaitingResult: games.filter(({ g, day }) => day < today && !isFinal(g) && !isOff(g)).length,
  };
  ledger.summary = { live: buildSummary(rows.filter(r => !r.backfilled)), backfilled: buildSummary(rows.filter(r => r.backfilled)) };

  // Leave the files alone when nothing moved, so an hourly run with no news makes no commit.
  const body = l => JSON.stringify({ ...l, updatedAt: null });
  const changed = !previous || body(previous) !== body(ledger);
  if (changed) ledger.updatedAt = now;
  const s = ledger.stats;
  console.log(`[paper-bets] ${mode}: ${s.entries} game(s) tracked from ${since} (${captured} new pregame line(s), ${backfilled} backfilled, ${closed} closing line(s) added); ${s.settled} settled, ${s.open} open, ${s.void} void; ${s.noLine} with no line, ${s.unmatched} unmatched${unreachable ? `; ${unreachable} ESPN request(s) failed and will be retried` : ""}.`);
  for (const [name, group] of Object.entries(ledger.summary)) {
    if (group.overall.bets) console.log(`[paper-bets]   ${name}: ` + MARKETS.map(m => { const a = group.markets[m].slices[0]; return `${m} ${a.wins}-${a.losses}-${a.pushes} ${units(a.units)}`; }).join(", "));
  }
  if (DRY_RUN) { console.log("[paper-bets] Dry run: nothing written."); return; }
  if (!changed) { console.log("[paper-bets] No change; ledger and report left as they are."); return; }
  await mkdir("docs", { recursive: true });
  await mkdir(".cache", { recursive: true });
  // Write beside the target and rename, so a crash mid-write cannot corrupt the ledger.
  await writeFile(`${paths.ledger}.tmp`, JSON.stringify(ledger, null, 1) + "\n");
  await rename(`${paths.ledger}.tmp`, paths.ledger);
  await writeFile(paths.report, report(ledger, rows, mode));
  console.log(`[paper-bets] Wrote ${paths.ledger} and ${paths.report}.`);
}

// ---------- report ----------
const units = v => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}u`);
const pct = (v, d = 1) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
const signedPct = v => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`);
const range = (ci, f) => (ci ? ` (${f(ci[0])} to ${f(ci[1])})` : "");
const price = a => (a > 0 ? `+${a}` : `${a}`.replace("-", "−"));
const num = v => `${v}`.replace("-", "−");
const table = (head, lines) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...lines.map(l => `| ${l.join(" | ")} |`)].join("\n");
const statCells = s => [s.bets, `${s.wins}-${s.losses}-${s.pushes}`, `${pct(s.winPct)}${range(s.winPctCI, pct)}`, pct(s.breakEvenPct), units(s.units), `${signedPct(s.roi)}${range(s.roiCI, signedPct)}`, s.bets ? s.sample ?? "" : "no bets yet"];
const STAT_HEAD = ["Bets", "W-L-P", "Win % (95% range)", "Break-even", "Units", "ROI (95% range)", "Read"];
const MARKET_LABEL = { moneyline: "Moneyline", spread: "Against the spread", total: "Total (over/under)" };

function groupSection(title, intro, group) {
  if (!group.overall.bets && !group.overall.open) return `## ${title}\n\n${intro}\n\nNo bets yet.\n`;
  const out = [`## ${title}`, "", intro, ""];
  out.push(table(["Market", ...STAT_HEAD], [
    ...MARKETS.map(m => [MARKET_LABEL[m], ...statCells(group.markets[m].slices[0])]),
    ["**All three**", ...statCells(group.overall)],
  ]));
  if (group.overall.open) out.push("", `${group.overall.open} bet(s) still open.`);
  for (const m of MARKETS) {
    const { slices, clv } = group.markets[m];
    if (!slices[0].bets) continue;
    out.push("", `### ${MARKET_LABEL[m]}`, "", table(["Slice", ...STAT_HEAD], slices.map(s => [s.label, ...statCells(s)])));
    if (clv.bets) out.push("", `Closing-line value on ${clv.bets} bet(s) with both a frozen pregame line and a close: average ${m === "moneyline" ? signedPct(clv.avg) + " no-vig probability" : `${num(clv.avg)} points`}, ${pct(clv.beatPct, 0)} beat the close.`);
  }
  return out.join("\n") + "\n";
}

function report(ledger, rows, mode) {
  const s = ledger.stats;
  const settled = rows.filter(r => r.result && r.result !== "void").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, RECENT_BETS);
  const pick = r => (r.market === "moneyline" ? `${r.pick} ML` : r.market === "spread" ? `${r.pick} ${r.line > 0 ? "+" : ""}${num(r.line)}` : `${r.pick} ${r.line}`);
  const out = [
    mode === "backfill" ? "# Paper bets: season backfill (closing lines)" : "# Paper bets: model vs the sportsbook",
    "",
    "**Simulation only. No real money is involved, this file is not part of the site, and nothing here predicts or guarantees future results.**",
    "",
    `Regenerated by \`node scripts/paper-bets.mjs${mode === "backfill" ? ` --backfill=${ledger.since}` : ""}\`. Ledger last changed ${ledger.updatedAt}. Games from ${ledger.since} (Eastern). Flat 1 unit per bet.`,
    "",
  ];
  if (mode === "backfill") {
    out.push(groupSection("Results at the closing line", "Every final with a closing line, bet with the model's walk-forward prediction (built only from games before that day). The close is the sharpest price of the day, so this is the hardest version of the test. It is kept apart from the live ledger.", ledger.summary.backfilled));
  } else {
    out.push(groupSection("Live-captured bets", "Line and model prediction frozen before tip-off. This is the record that counts.", ledger.summary.live));
    out.push(groupSection("Backfilled bets", "Games first seen after they finished: closing line plus the walk-forward prediction. Honest, but not captured in real time, so read separately.", ledger.summary.backfilled));
  }
  out.push(`## Last ${RECENT_BETS} settled bets`, "");
  out.push(settled.length ? table(["Day", "Game (away-home score)", "Market", "Pick", "Price", "Model edge", "Result", "Units"], settled.map(r => [r.day, `${r.game} (${r.score})`, r.market, pick(r), `${price(r.price)}${r.priceAssumed ? " (assumed)" : ""}`, r.edge == null ? "–" : signedPct(r.edge), r.result, units(r.profit)])) : "None yet.");
  out.push("", "## Coverage", "",
    `- Games in the window: ${s.gamesInWindow} (${s.finals} final)`,
    `- Tracked with a line: ${s.entries} (${s.liveCaptured} captured before tip-off, ${s.backfilled} backfilled from the close); ${s.settled} settled, ${s.open} open, ${s.void} void (postponed, canceled or moved)`,
    `- Finals with no line posted (mostly small-school and non-Division I games; never given an invented price): ${s.noLine}`,
    `- Finals that could not be matched to an ESPN event (usually a non-Division I opponent): ${s.unmatched}`,
    ...(s.noPrediction ? [`- Finals with a line but no model prediction: ${s.noPrediction}`] : []),
    ...(mode === "live" ? [`- Upcoming games with no line posted yet: ${s.awaitingLine}`, `- Live bets that also have a closing line: ${s.withClosing}`] : []),
    `- Past games still waiting for a final score: ${s.awaitingResult}`,
    "", "## How to read this", "",
    "- This is a simulation for learning, not betting advice. A winning stretch on paper does not mean the model beats the book, and past results do not guarantee anything about future ones.",
    `- Break-even at the standard −110 price is ${pct(americanToImplied(-110))}: a spread or total record has to win more often than that just to cover the book's cut. A coin flip loses about 4.5% of what it stakes.`,
    "- Moneyline win % means little alone, because heavy favorites win often and pay almost nothing (a −4000 favorite returns 0.025 units). Compare it with the Break-even column, the win rate the prices themselves demanded, and look at Units and ROI.",
    "- ROI is units won per unit staked. The 95% range is how far luck alone could move the number; if it includes 0%, the sample cannot tell a real edge from chance. Rows marked \"too few to read\" (under 30 bets) or \"small sample\" (under 100) should not be acted on. Slices overlap and there are many of them, so one good-looking row is expected by chance.",
    "- Model edge is the model's win probability for the bet minus the book's probability with its cut removed. If the model has real skill, bigger-edge slices should do better. Spread and total probabilities assume a normal distribution around the model's number.",
    "- The spread-size and favorite/underdog slices answer whether lopsided games are carrying the record.",
    "- Closing-line value compares the frozen pregame number with the close. Consistently beating the close is the earliest reliable sign of an edge; results alone need hundreds of bets.",
    "- Prices are DraftKings numbers as published by ESPN. A spread or total with no posted price is assumed at −110 and marked. Games with no line are left out, never estimated.",
    "");
  return out.join("\n");
}

// Never fail the pipeline: anything unexpected leaves the previous ledger and report untouched.
try { await main(); } catch (error) { console.warn(`[paper-bets] Skipped after an error (previous ledger kept): ${error?.stack ?? error}`); }
process.exitCode = 0;
