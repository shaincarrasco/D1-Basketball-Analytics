// ESPN college football endpoints used by the fetch script, and their normalisers.
import { getJson } from "./http.mjs";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const V2 = "https://site.api.espn.com/apis/v2/sports/football/college-football";
const FBS_GROUP = "80";

export const fetchScoreboard = (seasontype, week) =>
  getJson(`${SITE}/scoreboard?groups=${FBS_GROUP}&seasontype=${seasontype}${week ? `&week=${week}` : ""}&limit=300`);

export const fetchSummary = (id) => getJson(`${SITE}/summary?event=${id}`);

export const fetchRoster = async (teamId) => {
  const j = await getJson(`${SITE}/teams/${teamId}/roster`);
  if (!j) return [];
  return (j.athletes ?? []).flatMap((g) => g.items ?? []).map((it) => ({
    id: String(it.id),
    name: it.displayName ?? it.fullName ?? "",
    last: it.lastName ?? (it.displayName ?? "").split(" ").pop(),
    jersey: it.jersey ?? null,
    pos: it.position?.abbreviation ?? null,
    hs: it.headshot?.href ?? null,
  }));
};

const scoreOf = (c, state) => (state === "pre" || c.score == null ? null : Number(c.score));
const rankOf = (c) => {
  const r = c.curatedRank?.current;
  return Number.isFinite(r) && r > 0 && r < 99 ? r : null;
};
// name and logo let the site show opponents that are not in teams.json (FCS).
const sideOf = (c, state) => ({
  id: c.team?.id == null ? null : String(c.team.id),
  name: c.team?.shortDisplayName ?? c.team?.displayName ?? null,
  logo: c.team?.logo ?? c.team?.logos?.[0]?.href ?? null,
  score: scoreOf(c, state),
  rank: rankOf(c),
  winner: c.winner === true,
});

/** One scoreboard event as the site's Game shape (see DATA.md). */
export function toGame(ev) {
  const c = ev.competitions[0];
  const st = c.status?.type ?? {};
  const state = st.state ?? "pre";
  const home = c.competitors.find((x) => x.homeAway === "home");
  const away = c.competitors.find((x) => x.homeAway === "away");
  return {
    id: String(ev.id),
    date: ev.date,
    status: state,
    detail: st.shortDetail ?? st.detail ?? "",
    neutral: c.neutralSite === true,
    venue: c.venue?.fullName ?? null,
    tv: c.broadcasts?.[0]?.names?.[0] ?? null,
    home: sideOf(home, state),
    away: sideOf(away, state),
  };
}

const statOf = (stats, name) => stats.find((s) => s.name === name);
const recordOf = (str) => {
  const m = /^(\d+)-(\d+)/.exec(String(str ?? ""));
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/**
 * FBS teams with conference and record, from the standings tree under the FBS group.
 * Conference name is the top-level child (e.g. "Sun Belt Conference"); its divisions are walked too.
 */
export async function fetchFbsTeams() {
  const top = await getJson(`${V2}/standings?group=${FBS_GROUP}`);
  const leaves = [];
  const collect = async (groupId, confName) => {
    const node = await getJson(`${V2}/standings?group=${groupId}`);
    if (!node) return;
    const name = confName ?? node.name;
    if (node.standings?.entries?.length) leaves.push({ confName: name, entries: node.standings.entries });
    for (const child of node.children ?? []) await collect(child.id, name);
  };
  for (const child of top?.children ?? []) await collect(child.id, child.name);

  // Standings entries carry no colours or logos; the teams list does.
  const list = await getJson(`${SITE}/teams?groups=${FBS_GROUP}&limit=500`);
  const look = new Map(
    (list?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((x) => [String(x.team.id), x.team]),
  );

  const teams = new Map();
  for (const { confName, entries } of leaves) {
    for (const e of entries) {
      const t = e.team;
      const id = String(t.id);
      if (teams.has(id)) continue;
      const overall = recordOf(statOf(e.stats, "overall")?.displayValue) ?? [statOf(e.stats, "wins")?.value ?? 0, statOf(e.stats, "losses")?.value ?? 0];
      const conf = recordOf(statOf(e.stats, "vs. Conf.")?.displayValue) ?? [0, 0];
      const x = look.get(id) ?? {};
      const hex = (c) => (c ? `#${String(c).replace(/^#/, "")}` : null);
      teams.set(id, {
        id,
        name: t.displayName ?? x.displayName,
        short: t.shortDisplayName ?? x.shortDisplayName ?? t.location ?? x.location,
        abbr: t.abbreviation ?? x.abbreviation,
        color: hex(x.color ?? t.color),
        altColor: hex(x.alternateColor ?? t.alternateColor),
        logo: (x.logos ?? t.logos)?.[0]?.href ?? null,
        confName,
        confSlug: slug(confName),
        wins: overall[0],
        losses: overall[1],
        confWins: conf[0],
        confLosses: conf[1],
        apRank: null,
        cfpRank: null,
      });
    }
  }
  return teams;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** CFP, AP and Coaches polls from the rankings feed (FBS only is enforced by the caller). */
export async function fetchPolls() {
  const j = await getJson(`${SITE}/rankings`);
  const want = [
    ["cfp", (p) => /playoff committee/i.test(p.name)],
    ["ap", (p) => p.name === "AP Top 25"],
    ["coaches", (p) => p.name === "AFCA Coaches Poll"],
  ];
  const out = [];
  for (const [key, match] of want) {
    const p = (j?.rankings ?? []).find(match);
    if (!p) continue;
    out.push({
      key,
      name: p.name,
      date: p.date ?? null,
      ranks: (p.ranks ?? []).map((r) => ({
        rank: r.current,
        teamId: String(r.team?.id),
        record: r.recordSummary ?? null,
        points: r.points ?? null,
        firstPlace: r.firstPlaceVotes ?? null,
        previous: r.previous ?? null,
      })),
    });
  }
  return out;
}
