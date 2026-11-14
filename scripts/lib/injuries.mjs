// Injury engine: merges every availability signal we have into one status per player, estimates
// what each absence costs his team, and keeps a season-long ledger so changes and returns are
// tracked over time (public/data/injury-ledger-2027.json, committed by the deploy workflow).
//
// Signals, in priority order:
//   espn     ESPN's injury list (official status; empty for most college teams)
//   manual   curated reports with a source link (public/data/injury-reports-2027.json)
//   news     injury / suspension headlines that tag the player or name him in team news
//   box      box scores: a rotation player who stopped appearing (reason not reported)
// A curated or headline absence clears itself the moment the player logs minutes after it.
import { classify, INJURY_WORDS, OUT_STATES, STATE_LABEL, STATES } from "./injury-text.mjs";

const DAY = 864e5;
const REPLACEMENT_DPR = -2; // a typical end-of-bench player, points per 100 vs average
const DPR_SHRINK_POSS = 1500;
const HEADLINE_DAYS = 45; // how long an injury headline can stand on its own
const MONITOR_DAYS = 4; // "hurt in the win" stays a note only this long
const EVENTS_PER_PLAYER = 40;
const WIRE_DAYS = 21;

export const nameKey = n => String(n ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const day = iso => (iso ? String(iso).slice(0, 10) : null);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const r1 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r3 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

function labelFor(state, kind, missed, yetToPlay) {
  if (state === "missed") return missed === 1 ? "Missed last game" : `Missed last ${missed} games`;
  if (kind === "suspension" && (state === "out" || state === "season")) return state === "season" ? "Suspended for season" : "Suspended";
  if (kind === "eligibility" && (state === "out" || state === "season")) return "Ineligible";
  if (state === "out" && yetToPlay) return "Out (yet to debut)";
  return STATE_LABEL[state] ?? "Unavailable";
}

/**
 * @param {object} p
 * @param {{slug:string,id:string,name:string,conf:string,rank:number|null,adjT:number|null}[]} p.teams
 * @param {Map<string,string|null>} p.espnIdBySlug
 * @param {Record<string,{id:string,name:string,pos?:string,jersey?:string}[]>} p.rosters ESPN rosters by ESPN team id
 * @param {(teamId:string)=>{pid:string,name:string,pos:string|null,g:number|null,min:number|null,pts:number|null,reb:number|null,ast:number|null,dpr:number|null,onPoss:number|null}[]} p.teamPlayers
 * @param {Map<string,Record<string,any[][]>>} p.logsBySlug pid -> game rows
 * @param {string[]} p.logFields
 * @param {Map<string,string>} p.aidByPid
 * @param {Map<string,string[]>} p.teamDaysByEspn ESPN team id -> sorted days with an ESPN box score
 * @param {Map<string,{day:string,result:string|null,pts:number|null,oppPts:number|null}[]>} p.teamGames team id -> games
 * @param {any} p.feeds feeds-2027.json
 * @param {any[]} p.curated injury-reports-2027.json entries
 * @param {any} p.ledger previous ledger (or null)
 * @param {string} p.now ISO time of this check
 */
export function buildInjuries(p) {
  const { teams, espnIdBySlug, rosters, teamPlayers, logsBySlug, logFields, aidByPid, teamDaysByEspn, teamGames, feeds, curated = [], now } = p;
  const today = day(now);
  const MIN = logFields.indexOf("min");
  const art = id => feeds?.articles?.[id] ?? null;
  const injByAid = new Map((feeds?.injuries ?? []).map(i => [String(i.athlete), i]));
  const curatedByKey = new Map();
  for (const c of curated) if (c?.team && c?.name) curatedByKey.set(`${String(c.team).toLowerCase()}|${nameKey(c.name)}`, c);
  const rows = [];
  const lastPlayedByKey = new Map();

  for (const t of teams) {
    const espnId = espnIdBySlug.get(t.slug);
    const teamDays = espnId ? teamDaysByEspn.get(String(espnId)) ?? [] : [];
    const logs = logsBySlug.get(t.slug) ?? {};
    const games = (teamGames.get(t.id) ?? []).filter(g => g.result);
    const resultByDay = new Map(games.map(g => [g.day, g]));
    const statPlayers = teamPlayers(t.id);
    const knownAids = new Set(statPlayers.map(sp => aidByPid.get(sp.pid)).filter(Boolean).map(String));
    // ESPN roster players with no stats line yet (preseason injuries, redshirts, late adds).
    const rosterOnly = (espnId ? rosters?.[espnId] ?? [] : []).filter(a => !knownAids.has(String(a.id)));
    const teamArticles = (espnId ? feeds?.teamNews?.[espnId] ?? [] : []).map(id => [id, art(id)]).filter(([, a]) => a);
    const candidates = [
      ...statPlayers.map(sp => ({ ...sp, aid: aidByPid.get(sp.pid) ?? null })),
      ...rosterOnly.map(a => ({ pid: null, aid: String(a.id), name: a.name, pos: a.pos ?? null, g: 0, min: null, pts: null, reb: null, ast: null, dpr: null, onPoss: null })),
    ];

    for (const c of candidates) {
      const key = `${t.slug}:${c.aid ?? c.pid}`;
      const plays = (c.pid ? logs[c.pid] ?? [] : []).filter(l => (l[MIN] ?? 0) > 0);
      const played = new Set(plays.map(l => l[0]));
      const lastPlayed = plays.length ? plays.map(l => l[0]).sort().at(-1) : null;
      lastPlayedByKey.set(key, lastPlayed);
      const mpg = plays.length ? plays.reduce((s, l) => s + (l[MIN] ?? 0), 0) / plays.length : (c.min ?? null);
      let missed = 0;
      for (let i = teamDays.length - 1; i >= 0 && !played.has(teamDays[i]); i--) missed++;
      const gp = Math.max(plays.length, c.g ?? 0);
      const yetToPlay = gp === 0;
      const playedSince = d => !!lastPlayed && !!d && lastPlayed > d;

      // Headlines: athlete-tagged first, then team news that names him in full.
      const nk = nameKey(c.name);
      const tagged = c.aid ? (feeds?.athleteNews?.[c.aid] ?? []).map(id => [id, art(id)]).filter(([, a]) => a) : [];
      const named = nk.length > 6 ? teamArticles.filter(([, a]) => nameKey(a.headline).includes(nk)) : [];
      const heads = [...new Map([...tagged, ...named]).values()]
        .filter(a => INJURY_WORDS.test(a.headline) && Date.parse(now) - Date.parse(a.published) < HEADLINE_DAYS * DAY)
        .sort((a, b) => b.published.localeCompare(a.published));

      let s = null; // { state, kind, body, expected, weeks, detail, since, source, url, confidence }
      const espnInj = c.aid ? injByAid.get(String(c.aid)) : null;
      const cur = curatedByKey.get(`${t.name.toLowerCase()}|${nk}`) ?? curatedByKey.get(`${t.slug}|${nk}`) ?? curatedByKey.get(`${(t.short ?? "").toLowerCase()}|${nk}`);
      if (espnInj) {
        const k = classify(`${espnInj.status} ${espnInj.detail ?? ""}`);
        s = { ...k, state: k.state ?? "out", detail: espnInj.detail ?? null, since: day(espnInj.date), source: "espn", url: null, confidence: "confirmed" };
      } else if (cur && !playedSince(day(cur.reported))) {
        const k = classify(`${cur.status} ${cur.expected ?? ""} ${cur.detail ?? ""}`);
        const state = /season/i.test(cur.status) || /season/i.test(cur.expected ?? "") ? "season" : k.state ?? "out";
        s = { state, kind: cur.kind ?? k.kind, body: cur.body ?? k.body, expected: cur.expected ?? k.expected, weeks: k.weeks, detail: cur.detail ?? null, since: day(cur.reported), source: "manual", url: cur.url ?? null, confidence: "reported", publisher: cur.source ?? null };
      }
      if (!s && heads.length) {
        for (const h of heads) {
          const k = classify(h.headline);
          const hd = day(h.published);
          if (k.returning) break; // newest relevant headline says he's back
          if (!k.state) continue;
          if (playedSince(hd) && missed === 0) {
            // He's played since: only a fresh "hurt in the game" note survives.
            if (k.state === "monitor" && Date.parse(now) - Date.parse(h.published) < MONITOR_DAYS * DAY) s = { ...k, detail: h.headline, since: hd, source: "news", url: h.url, confidence: "reported" };
            break;
          }
          s = { ...k, state: k.state === "monitor" && missed > 0 ? "out" : k.state, detail: h.headline, since: hd, source: "news", url: h.url, confidence: "reported" };
          break;
        }
      }
      // Sticky reasons: articles age out of the feed after three weeks, but a reported absence
      // stands until he actually plays again (the ledger remembers what was reported).
      const was = p.ledger?.players?.[key]?.open;
      if (!s && was && was.source !== "box" && !playedSince(was.since)) {
        s = { state: was.state, kind: was.kind ?? classify(was.detail ?? "").kind, body: was.body, expected: was.expected, weeks: was.weeks ?? null, detail: was.detail, since: was.since, source: was.source, url: was.url, publisher: was.publisher ?? null, confidence: was.source === "espn" ? "confirmed" : "reported" };
      }
      if (!s && missed > 0 && gp > 0 && (mpg ?? 0) >= 12 && teamDays.length - missed >= 1) {
        s = { state: "missed", kind: "unknown", body: null, expected: null, weeks: null, detail: null, since: teamDays[teamDays.length - missed], source: "box", url: null, confidence: "inferred" };
      }
      if (!s) continue;
      // A "missed" box flag picks up the reason from a headline when one exists.
      if (s.source === "box" && heads[0]) s.detail = heads[0].headline, s.url = heads[0].url;

      const eta = s.weeks && s.since ? [addDays(s.since, s.weeks[0] * 7), addDays(s.since, s.weeks[1] * 7)] : null;
      // DPR swings ±8 on a few hundred possessions, so for the impact estimate pull it toward average
      // until the sample is big (half weight at 1,500 on-court possessions).
      const dpr = c.dpr != null && c.onPoss ? c.dpr * (c.onPoss / (c.onPoss + DPR_SHRINK_POSS)) : null;
      const out = OUT_STATES.has(s.state);
      const netLoss = mpg != null ? Math.max(0, (mpg / 40) * ((dpr ?? 0) - REPLACEMENT_DPR)) : null;
      // Team record with and without him (ESPN-covered games only).
      let ww = null;
      if (gp > 0) {
        const w = [0, 0, 0], wo = [0, 0, 0];
        for (const d of teamDays) {
          const g = resultByDay.get(d); if (!g || g.pts == null) continue;
          const side = played.has(d) ? w : wo;
          side[g.result === "W" ? 0 : 1]++; side[2] += g.pts - g.oppPts;
        }
        const n1 = w[0] + w[1], n2 = wo[0] + wo[1];
        if (n2 > 0) ww = { with: [w[0], w[1], n1 ? r1(w[2] / n1) : null], without: [wo[0], wo[1], r1(wo[2] / n2)] };
      }
      rows.push({
        key, pid: c.pid, aid: c.aid, name: c.name, pos: c.pos ?? null,
        slug: t.slug, team: t.name, conf: t.conf, rank: t.rank,
        state: s.state, status: labelFor(s.state, s.kind, missed, yetToPlay), kind: s.kind, weeks: s.weeks ?? null, body: s.body ?? null, expected: s.expected ?? null, eta,
        detail: s.detail, since: s.since, source: s.source, url: s.url ?? null, publisher: s.publisher ?? (s.source === "news" ? "ESPN" : null), confidence: s.confidence,
        missed, lastPlayed, gp, yetToPlay,
        impact: { mpg: r1(mpg), ppg: r1(c.pts), rpg: r1(c.reb), apg: r1(c.ast), minShare: mpg != null ? r3(mpg / 200) : null, dpr: r1(dpr), netLoss: out ? r1(netLoss) : 0 },
        ww,
      });
    }
  }
  rows.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || (b.impact.netLoss ?? 0) - (a.impact.netLoss ?? 0) || (a.rank ?? 999) - (b.rank ?? 999));

  // ---------- ledger: what changed since the last check ----------
  const prev = p.ledger?.players ?? {};
  const firstRun = !p.ledger;
  const players = structuredClone(prev);
  const snap = r => ({ state: r.state, status: r.status, kind: r.kind, body: r.body, expected: r.expected, weeks: r.weeks, detail: r.detail, source: r.source, url: r.url, publisher: r.publisher, since: r.since, missed: r.missed });
  const push = (e, ev) => { e.events.push(ev); if (e.events.length > EVENTS_PER_PLAYER) e.events.splice(0, e.events.length - EVENTS_PER_PLAYER); };
  const current = new Map(rows.map(r => [r.key, r]));
  for (const r of rows) {
    const e = players[r.key] ?? (players[r.key] = { key: r.key, pid: r.pid, aid: r.aid, name: r.name, slug: r.slug, open: null, events: [], stints: [] });
    e.name = r.name; e.pid = r.pid ?? e.pid;
    const at = firstRun ? `${r.since ?? today}T12:00:00Z` : now;
    if (!e.open) {
      push(e, { t: at, kind: "new", state: r.state, status: r.status, body: r.body, detail: r.detail, url: r.url, source: r.source });
      e.stints.push({ from: r.since ?? today, to: null, state: r.state, body: r.body, kind: r.kind, missed: r.missed });
    } else {
      const was = e.open;
      const worse = STATES.indexOf(r.state) < STATES.indexOf(was.state);
      const changed = was.state !== r.state || (r.body && was.body !== r.body) || (r.expected && was.expected !== r.expected) || (r.source !== "box" && r.detail && was.detail !== r.detail);
      if (changed) push(e, { t: now, kind: worse ? "worse" : was.state !== r.state ? "better" : "update", state: r.state, status: r.status, from: was.status, body: r.body, detail: r.detail, url: r.url, source: r.source });
      const st = e.stints.at(-1);
      if (st && st.to == null) { st.state = r.state; st.body = r.body ?? st.body; st.kind = r.kind ?? st.kind; st.missed = Math.max(st.missed ?? 0, r.missed); }
    }
    e.open = snap(r);
  }
  for (const [key, e] of Object.entries(players)) {
    if (!e.open || current.has(key)) continue;
    const lp = lastPlayedByKey.get(key) ?? null;
    const st = e.stints.at(-1);
    const back = lp && st && lp >= st.from;
    push(e, { t: now, kind: back ? "returned" : "cleared", state: null, status: back ? "Back in the lineup" : "No longer listed", from: e.open.status, body: e.open.body, detail: back ? `Played on ${lp}` : null, url: null, source: e.open.source });
    if (st && st.to == null) st.to = back ? lp : today;
    e.open = null;
  }
  const ledger = { season: 2027, updated: now, players };

  // ---------- wire: the last three weeks of changes ----------
  const teamBySlug = new Map(teams.map(t => [t.slug, t]));
  const cutoff = Date.parse(now) - WIRE_DAYS * DAY;
  const wire = Object.values(players).flatMap(e => e.events.filter(ev => Date.parse(ev.t) >= cutoff).map(ev => {
    const t = teamBySlug.get(e.slug);
    const row = current.get(e.key);
    return { ...ev, key: e.key, pid: e.pid ?? null, name: e.name, slug: e.slug, team: t?.name ?? e.slug, conf: t?.conf ?? null, rank: t?.rank ?? null, netLoss: row?.impact.netLoss ?? null };
  })).sort((a, b) => b.t.localeCompare(a.t) || (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 400);

  // ---------- team health ----------
  const health = new Map();
  for (const t of teams) health.set(t.slug, { slug: t.slug, team: t.name, conf: t.conf, rank: t.rank, out: 0, limited: 0, minShare: 0, netLoss: 0, ppgLost: 0, keys: [] });
  for (const r of rows) {
    const h = health.get(r.slug); if (!h) continue;
    h.keys.push(r.key);
    if (OUT_STATES.has(r.state)) { h.out++; h.minShare += r.impact.minShare ?? 0; h.netLoss += r.impact.netLoss ?? 0; h.ppgLost += r.impact.ppg ?? 0; }
    else if (r.state !== "monitor") h.limited++;
  }
  const teamHealth = [...health.values()].filter(h => h.keys.length).map(h => ({ ...h, minShare: r3(Math.min(1, h.minShare)), netLoss: r1(h.netLoss), ppgLost: r1(h.ppgLost) }))
    .sort((a, b) => b.netLoss - a.netLoss || b.minShare - a.minShare);

  // ---------- per-team history for team and player pages ----------
  const historyBySlug = new Map();
  for (const e of Object.values(players)) {
    if (!historyBySlug.has(e.slug)) historyBySlug.set(e.slug, []);
    historyBySlug.get(e.slug).push({ key: e.key, pid: e.pid ?? null, name: e.name, open: !!e.open, events: e.events.slice(-15), stints: e.stints });
  }
  return { rows, ledger, wire, teamHealth, historyBySlug };
}
