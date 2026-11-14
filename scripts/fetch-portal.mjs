// Men's D-I transfer portal entries from College Basketball Data (GET /recruiting/portal).
//
// Run directly (`node scripts/fetch-portal.mjs`) to refresh public/data/portal-2027.json. Non-fatal like
// fetch-recruiting: a missing CBBD_API_KEY or a failed request keeps the cached file and warns.
//
// "2027" here is the site's season name (2026–27): this file tracks the portal that opens after the
// 2027 national championship game, when players leave 2026–27 rosters for 2027–28. CBBD's `year`
// parameter is the "transfer season", and its docs don't say whether that is the calendar year of the
// window or the season the player transfers into. So we ask for 2027 and 2028 and keep the year whose
// players are on the ORIGIN team in our 2026–27 player file (last spring's movers are already on their
// DESTINATION roster, so a year that matches destinations is the previous cycle and is dropped).
// PORTAL_YEAR=<n> skips the check and uses that year as-is.
//
// CBBD gives no entry or commitment dates, so `firstSeen` / `committedSeen` are the dates our daily
// fetch first saw the entry / its destination (carried over from the cached file between runs).
//
// Also exports `linkPortal()`, which scripts/build-app-data.mjs uses to join entries to our teams
// and players and write public/data/app/portal.json.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PORTAL_FILE = "public/data/portal-2027.json";
const ENDPOINT = "https://api.collegebasketballdata.com/recruiting/portal";
const PROVIDER = "College Basketball Data /recruiting/portal";

/** The 2027 window, from the NCAA rule (15 days from the day after the title game) + the 2027 title-game date. */
export const PORTAL_WINDOW = {
  opens: "2027-04-06",
  closes: "2027-04-20",
  basis: "NCAA Division I rule adopted Jan. 14, 2026: the men's basketball notification-of-transfer window opens the day after the NCAA tournament championship game and stays open 15 days. The 2027 title game is April 5, 2027 (Detroit), so the window runs April 6–20, 2027. The NCAA had not published 2027-specific dates when this was written.",
  coachingChange: "After a head-coach change, players get a separate 15-day window that opens five days after the new coach is hired or announced (or on day 31 if no coach is named within 30 days); that extra window is available from the April window through Jan. 2.",
  sources: [
    { label: "NCAA.org: Division I Cabinet adopts new transfer windows (Jan. 14, 2026)", url: "https://www.ncaa.org/news/2026/1/14/media-center-division-i-cabinet-adopts-new-transfer-windows-in-several-sports.aspx" },
    { label: "Local 4 Detroit: 2027 Final Four at Ford Field, April 3 and 5, 2027", url: "https://www.clickondetroit.com/news/local/2026/04/07/detroit-to-host-2027-ncaa-mens-final-four-heres-what-to-know" },
  ],
};

// ---------- name matching (shared by the cycle check and linkPortal) ----------
const SUFFIX = /\b(jr|sr|ii|iii|iv)\b/g;
/** "Ja'Kobe Walter Jr." → "jakobewalter" */
export const normPerson = s => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[.'’`]/g, "").replace(SUFFIX, " ").replace(/[^a-z]/g, "");
/** Same as build-app-data's normName (team names). */
export const normTeam = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = v => (typeof v === "string" && v.trim() ? v.trim() : null);
const side = s => (s && (str(s.name) || num(s.id) !== null) ? { id: num(s.id), name: str(s.name), conf: str(s.conference) } : null);
const ELIG = new Set(["Withdrawn", "TBD", "PendingAppeal", "SittingOne", "Immediate"]);

/** One CBBD Transfer row → our raw entry (no dates yet). */
export function normalizeRow(r) {
  if (!r || num(r.id) === null) return null;
  const first = str(r.firstName) ?? "", last = str(r.lastName) ?? "";
  const name = `${first} ${last}`.trim();
  if (!name) return null;
  return {
    id: String(r.id), sourceId: str(r.sourceId), year: num(r.year), name, pos: str(r.position),
    from: side(r.origin), to: side(r.destination),
    eligibility: ELIG.has(r.eligibility) ? r.eligibility : null, yearsRemaining: num(r.yearsRemaining),
    stars: num(r.stars), rating: num(r.rating),
  };
}

/** How many entries match a 2026–27 player on their origin team vs their destination team. */
export function cycleCheck(entries, rosterKeys) {
  let origin = 0, destination = 0;
  for (const e of entries) {
    const p = normPerson(e.name);
    if (e.from?.name && rosterKeys.has(`${p}|${normTeam(e.from.name)}`)) origin++;
    if (e.to?.name && rosterKeys.has(`${p}|${normTeam(e.to.name)}`)) destination++;
  }
  return { origin, destination, verdict: origin > destination ? "current" : destination > origin ? "previous" : "unclear" };
}

/** Keep first-seen / committed-seen dates from the cached file. */
export function carryDates(entries, cached, today) {
  const prev = new Map((cached?.entries ?? []).map(e => [e.id, e]));
  return entries.map(e => {
    const old = prev.get(e.id);
    const committed = !!e.to && e.eligibility !== "Withdrawn";
    return {
      ...e,
      firstSeen: old?.firstSeen ?? today,
      committedSeen: committed ? (old?.committedSeen ?? today) : null,
    };
  });
}

// ---------- linking (used by build-app-data) ----------
/** G / F / C from CBBD positions (PG, SG, CG, WG, SF, PF, F, C…). */
export const posGroup = p => {
  const s = String(p ?? "").toUpperCase();
  if (!s) return null;
  if (s === "C") return "C";
  if (s.includes("G")) return "G";
  if (s.includes("F")) return "F";
  if (s.includes("C")) return "C";
  return null;
};
const REPLACEMENT_DPR = -2; // same replacement level as the injury engine (scripts/lib/injuries.mjs)
const r1 = v => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

/**
 * Join raw portal entries to our teams (by CBBD team id, then name) and players (same normalized name
 * on the origin team). `players` is the columnar table written to players.json.
 * Impact = (minutes per game / 40) × (DPR − replacement), floored at 0: estimated points per 100
 * possessions he was worth to his 2026–27 team over a replacement-level player.
 */
export function linkPortal(raw, { teams, players }) {
  const header = raw && typeof raw === "object" ? raw : {};
  const byId = new Map(teams.map(t => [String(t.id), t]));
  const byName = new Map(teams.map(t => [normTeam(t.name), t]));
  const team = s => (s ? (s.id !== null && byId.get(String(s.id))) || (s.name && byName.get(normTeam(s.name))) || null : null);
  const f = Object.fromEntries(players.fields.map((k, i) => [k, i]));
  const candidates = new Map();
  for (const row of players.rows) {
    const k = `${normPerson(row[f.name])}|${row[f.teamId]}`;
    (candidates.get(k) ?? candidates.set(k, []).get(k)).push(row);
  }
  const place = s => {
    if (!s) return null;
    const t = team(s);
    return { slug: t?.slug ?? null, name: t?.name ?? s.name ?? "Unknown", conf: t?.confName ?? s.conf ?? null, confSlug: t?.confSlug ?? null, d1: !!t };
  };
  const entries = (Array.isArray(header.entries) ? header.entries : []).map(e => {
    const fromTeam = team(e.from);
    const hits = fromTeam ? candidates.get(`${normPerson(e.name)}|${fromTeam.id}`) ?? [] : [];
    const p = hits.length === 1 ? hits[0] : null; // two same-named teammates: don't guess
    const g = p ? p[f.g] : null, min = p ? p[f.min] : null, dpr = p && f.dpr !== undefined ? p[f.dpr] : null;
    const impact = p && g && min !== null && dpr !== null ? Math.max(0, (min / 40) * (dpr - REPLACEMENT_DPR)) : null;
    const status = e.eligibility === "Withdrawn" ? "withdrawn" : e.to ? "committed" : "available";
    return {
      key: e.id, name: e.name, pos: e.pos ?? null, posN: posGroup(e.pos ?? (p ? p[f.pos] : null)), status,
      elig: e.eligibility ?? null, yrs: e.yearsRemaining ?? null, stars: e.stars ?? null, rating: e.rating ?? null,
      firstSeen: e.firstSeen ?? null, committedSeen: e.committedSeen ?? null,
      from: place(e.from), to: status === "withdrawn" ? null : place(e.to),
      pid: p ? String(p[f.id]) : null,
      stats: p ? { g, min: r1(min), pts: r1(p[f.pts]), reb: r1(p[f.reb]), ast: r1(p[f.ast]), ts: r1(p[f.ts]), dpr: r1(dpr), onPoss: f.onPoss !== undefined ? p[f.onPoss] : null } : null,
      impact: r1(impact),
    };
  });
  return {
    provider: header.provider ?? PROVIDER, fetchedAt: header.fetchedAt ?? null, status: header.status ?? "not-open",
    year: header.year ?? null, note: header.note ?? null, window: PORTAL_WINDOW,
    linked: entries.filter(e => e.pid).length, count: entries.length, entries,
  };
}

// ---------- fetch (only when run directly) ----------
async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await readFile(PORTAL_FILE, "utf8").then(JSON.parse).catch(() => null);
  const key = process.env.CBBD_API_KEY;
  if (!key) { console.warn(`[portal] CBBD_API_KEY missing; keeping the cached ${PORTAL_FILE}.`); return; }

  const roster = await readFile("public/data/player-season-2027.json", "utf8").then(JSON.parse).catch(() => ({ players: [] }));
  const rosterKeys = new Set((roster.players ?? []).map(p => `${normPerson(p.name)}|${normTeam(p.teamName)}`));
  const forced = Number(process.env.PORTAL_YEAR) || null;
  const years = forced ? [forced] : [2027, 2028];

  const results = [];
  for (const year of years) {
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set("year", String(year));
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("unexpected payload");
      if (rows[0]) console.log(`[portal] year=${year} sample row:`, JSON.stringify(rows[0]).slice(0, 600));
      const entries = rows.map(normalizeRow).filter(Boolean);
      const check = cycleCheck(entries, rosterKeys);
      console.log(`[portal] year=${year}: ${entries.length} entries; ${check.origin} match a 2026–27 player on the origin team, ${check.destination} on the destination team → ${check.verdict}.`);
      results.push({ year, entries, check });
    } catch (error) {
      console.warn(`[portal] year=${year} failed: ${error instanceof Error ? error.message : error}`);
      results.push({ year, entries: null, check: null });
    }
  }
  if (results.every(r => r.entries === null)) { console.warn(`[portal] every request failed; keeping the cached ${PORTAL_FILE}.`); return; }

  const pick = forced
    ? results.find(r => r.entries)
    : results.filter(r => r.entries?.length && r.check.verdict === "current").sort((a, b) => b.check.origin - a.check.origin)[0];
  for (const r of results) if (r !== pick && r.entries?.length) console.warn(`[portal] year=${r.year} not used (${r.check.verdict === "previous" ? "these players are already on their new 2026–27 teams: last spring's cycle" : "can't tell which cycle it is"}).`);
  // A failed request for the year we'd normally use shouldn't wipe a good cache.
  if (!pick && results.some(r => r.entries === null) && cached?.entries?.length) { console.warn("[portal] a request failed and no current-cycle rows came back; keeping the cache."); return; }

  const entries = pick ? carryDates(pick.entries, cached, today) : [];
  const status = entries.length ? "available" : today < PORTAL_WINDOW.opens ? "not-open" : "empty";
  const payload = {
    provider: PROVIDER, endpoint: ENDPOINT, season: 2027, seasonLabel: "2026–27",
    cycle: "Spring 2027 window: players leaving 2026–27 rosters for 2027–28",
    year: pick?.year ?? null, fetchedAt: new Date().toISOString(), status, window: PORTAL_WINDOW,
    note: "CBBD publishes no entry or commitment dates; firstSeen / committedSeen are the dates our daily fetch first saw each entry and its destination.",
    count: entries.length,
    entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
  };
  await writeFile(PORTAL_FILE, JSON.stringify(payload, null, 1) + "\n");
  console.log(`[portal] saved ${entries.length} entries (status ${status}${pick ? `, CBBD year ${pick.year}` : ""}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
