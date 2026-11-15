// Smart ⌘K queries: "Duke vs UNC", "UNC roster", "3pt shooters in the SEC", "steals". Each turns into one direct link.
// Pure (no React, no DOM). The stat lexicon mirrors VIEW_STATS and slugOf in src/app/players/players-board.tsx:
// every sort key below is a stat key of its view there.

export type Chip = { kind: "stat" | "conf" | "pos" | "team" | "action"; label: string };
export type Intent = { label: string; sub: string; href: string; chips: Chip[] };
export type SmartTeam = { slug: string; name: string; short?: string | null; confSlug: string; confName: string };

type Pos = "G" | "F" | "C";

const FILLER = new Set(["best", "top", "leaders", "leader", "most", "in", "the", "who", "players", "player", "a", "of"]);
const VS_WORDS = new Set(["vs", "v", "versus", "at"]);

/** Team aliases. An alias only resolves when its slug is in the teams list. */
const TEAM_ALIASES: Record<string, string> = {
  unc: "north-carolina", zags: "gonzaga", uk: "kentucky", osu: "ohio-state", msu: "michigan-state",
  uconn: "uconn", byu: "byu", vcu: "vcu", smu: "smu", tcu: "tcu", lsu: "lsu", ucla: "ucla", usc: "usc",
  uva: "virginia", nova: "villanova", fsu: "florida-state", bama: "alabama",
};

/** Conference aliases. Each lists candidate slugs; the first one present in the teams list wins. */
const CONF_ALIASES: Record<string, string[]> = {
  "big ten": ["big-ten"], b1g: ["big-ten"], "big 10": ["big-ten"],
  "big 12": ["big-12"], "big east": ["big-east"],
  acc: ["acc"], sec: ["sec"],
  a10: ["atlantic-10"], "atlantic 10": ["atlantic-10"],
  wcc: ["wcc"], mwc: ["mwc", "mountain-west"], "mountain west": ["mountain-west", "mwc"], mvc: ["mvc"],
};

const POS_WORDS: [string, Pos][] = [
  ["guard", "G"], ["guards", "G"], ["point guard", "G"], ["point guards", "G"], ["shooting guard", "G"], ["shooting guards", "G"], ["pg", "G"], ["sg", "G"],
  ["forward", "F"], ["forwards", "F"], ["wing", "F"], ["wings", "F"], ["sf", "F"],
  ["center", "C"], ["centers", "C"], ["bigs", "C"], ["big man", "C"], ["big men", "C"],
];
const POS_PLURAL: Record<Pos, string> = { G: "guards", F: "forwards", C: "centers" };
const POS_TITLE: Record<Pos, string> = { G: "Guards", F: "Forwards", C: "Centers" };

type StatDef = { label: string; view: string; sort: string; words: string[] };
/** view names are the players-board VIEWS; sort is a key in that view's VIEW_STATS. */
const STATS: StatDef[] = [
  { label: "3P%", view: "Scoring", sort: "tpPct", words: ["3p", "3pt", "3pts", "3s", "3 pointers", "3 pointer", "3 point", "three", "threes", "three pointers", "three pointer", "three point", "shooters", "shooter", "sharpshooters", "sharpshooter"] },
  { label: "Points", view: "Scoring", sort: "pts", words: ["points", "point", "pts", "ppg", "scorers", "scorer", "scoring"] },
  { label: "Free-throw %", view: "Scoring", sort: "ftPct", words: ["ft", "ft%", "free throws", "free throw", "free throw %"] },
  { label: "True shooting %", view: "Efficiency", sort: "ts", words: ["ts", "ts%", "true shooting", "true shooting %"] },
  { label: "Efficiency (ORtg)", view: "Efficiency", sort: "ortg", words: ["efficiency", "efficient", "efficiently", "ortg", "offensive rating"] },
  { label: "Usage", view: "Advanced", sort: "usg", words: ["usage", "usg", "usg%"] },
  { label: "Impact (DPR)", view: "Impact", sort: "dpr", words: ["impact", "dpr", "overall"] },
  { label: "Assists", view: "Playmaking", sort: "ast", words: ["assists", "assist", "ast", "passers", "passer", "playmakers", "playmaker", "dimes"] },
  { label: "Rebounds", view: "Rebounding & defense", sort: "reb", words: ["rebounds", "rebound", "rebounding", "rebounders", "rebounder", "boards", "board", "rebs", "reb"] },
  { label: "Steals", view: "Rebounding & defense", sort: "stl", words: ["steals", "steal", "stl"] },
  { label: "Blocks", view: "Rebounding & defense", sort: "blk", words: ["blocks", "block", "blk", "blockers", "blocker", "shot blockers", "shot blocker", "rim protectors", "rim protector"] },
  { label: "Dunks", view: "Shooting profile", sort: "dunks", words: ["dunks", "dunk", "dunkers", "dunker"] },
];

const TABS = new Map<string, { tab: string; label: string }>([
  ["roster", { tab: "roster", label: "Roster" }],
  ["schedule", { tab: "schedule", label: "Schedule" }],
  ["stats", { tab: "stats", label: "Stats" }],
  ["news", { tab: "more", label: "News" }],
]);

/** Same slug rule as slugOf in players-board.tsx. */
const viewSlug = (v: string) => v.toLowerCase().replace(/&/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

/** Lowercase, strip accents, possessive 's, and punctuation. "UNC's" -> ["unc"], "3pt%" -> ["3pt"]. */
export function tokenize(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

type Phrase<T> = { toks: string[]; val: T };
/** Longest phrases first, so "three pointers" wins over "three". */
function phrasesOf<T>(entries: [string, T][]): Phrase<T>[] {
  return entries.map(([p, val]) => ({ toks: tokenize(p), val })).filter(p => p.toks.length > 0)
    .sort((a, b) => b.toks.length - a.toks.length);
}
const STAT_PHRASES = phrasesOf<StatDef>(STATS.flatMap(s => s.words.map(w => [w, s] as [string, StatDef])));
const POS_PHRASES = phrasesOf<Pos>(POS_WORDS);

type ConfRef = { slug: string; name: string; display: string };
type Index = { byPhrase: Map<string, SmartTeam>; maxLen: number; confPhrases: Phrase<ConfRef>[] };

const cache = new WeakMap<SmartTeam[], Index>();

function indexFor(teams: SmartTeam[]): Index {
  const hit = cache.get(teams);
  if (hit) return hit;
  const bySlug = new Map(teams.map(t => [t.slug, t]));
  // Priority by insertion order: full names, then short names, then slugs, then aliases.
  const byPhrase = new Map<string, SmartTeam>();
  const put = (phrase: string | null | undefined, t: SmartTeam) => {
    const k = tokenize(phrase ?? "").join(" ");
    if (k && !byPhrase.has(k)) byPhrase.set(k, t);
  };
  for (const t of teams) put(t.name, t);
  for (const t of teams) put(t.short, t);
  for (const t of teams) put(t.slug.replace(/-/g, " "), t);
  for (const [alias, slug] of Object.entries(TEAM_ALIASES)) { const t = bySlug.get(slug); if (t) put(alias, t); }

  const confName = new Map<string, string>();
  for (const t of teams) if (!confName.has(t.confSlug)) confName.set(t.confSlug, t.confName);
  const confs = new Map<string, ConfRef>();
  const putConf = (phrase: string, slug: string): boolean => {
    const name = confName.get(slug);
    const k = tokenize(phrase).join(" ");
    if (!name || !k) return false;
    if (!confs.has(k)) {
      const acronym = !k.includes(" ") && k.length <= 4;
      confs.set(k, { slug, name, display: acronym ? k.toUpperCase() : name.replace(/ conference$/i, "") });
    }
    return true;
  };
  for (const [slug, name] of confName) { putConf(slug.replace(/-/g, " "), slug); putConf(name, slug); }
  for (const [alias, slugs] of Object.entries(CONF_ALIASES)) for (const slug of slugs) if (putConf(alias, slug)) break;

  const ix: Index = {
    byPhrase,
    maxLen: Math.max(1, ...[...byPhrase.keys()].map(k => k.split(" ").length)),
    confPhrases: phrasesOf<ConfRef>([...confs.entries()].map(([k, c]) => [k, c] as [string, ConfRef])),
  };
  cache.set(teams, ix);
  return ix;
}

/** Drops filler words from both ends of a side ("the duke" -> "duke"). */
function trimFiller(words: string[]): string[] {
  let s = 0, e = words.length;
  while (s < e && FILLER.has(words[s])) s++;
  while (e > s && FILLER.has(words[e - 1])) e--;
  return words.slice(s, e);
}

/** "Duke vs UNC", "UNC v Duke", "Duke versus UNC", "Duke at Ohio State" (the second team is at home). */
function matchup(t: string[], ix: Index): Intent | null {
  const i = t.findIndex(w => VS_WORDS.has(w));
  if (i < 0 || t.slice(i + 1).some(w => VS_WORDS.has(w))) return null;
  const left = trimFiller(t.slice(0, i)), right = trimFiller(t.slice(i + 1));
  if (!left.length || !right.length) return null;
  const a = ix.byPhrase.get(left.join(" ")), b = ix.byPhrase.get(right.join(" "));
  if (!a || !b || a.slug === b.slug) return null;
  const at = t[i] === "at";
  const params = new URLSearchParams({ a: a.slug, b: b.slug, site: at ? "b" : "n" });
  return {
    label: `${a.name} ${at ? "at" : "vs"} ${b.name}`,
    sub: at ? `Matchup simulator · ${b.name} at home` : "Matchup simulator · neutral site",
    href: `/matchup/?${params}`,
    chips: [{ kind: "team", label: a.name }, { kind: "team", label: b.name }, { kind: "action", label: "Matchup" }],
  };
}

/** "Ohio State roster", "UNC news", "north carolina schedule". The team name can sit anywhere in the query. */
function teamTab(t: string[], ix: Index): Intent | null {
  for (let len = Math.min(t.length, ix.maxLen); len >= 1; len--) {
    for (let s = 0; s + len <= t.length; s++) {
      const team = ix.byPhrase.get(t.slice(s, s + len).join(" "));
      if (!team) continue;
      const rest = [...t.slice(0, s), ...t.slice(s + len)].filter(w => !FILLER.has(w));
      if (rest.length !== 1) return null;
      const tab = TABS.get(rest[0]);
      if (!tab) return null;
      return {
        label: `${team.name} ${tab.label.toLowerCase()}`,
        sub: `Team page · ${tab.label} tab`,
        href: `/teams/${team.slug}/?tab=${tab.tab}`,
        chips: [{ kind: "team", label: team.name }, { kind: "action", label: tab.label }],
      };
    }
  }
  return null;
}

/** Consumes every phrase it finds, longest first, and returns the distinct values. */
function takeAll<T>(t: string[], used: boolean[], phrases: Phrase<T>[], key: (v: T) => string): Map<string, T> {
  const found = new Map<string, T>();
  for (const p of phrases) {
    for (let i = 0; i + p.toks.length <= t.length; i++) {
      if (p.toks.some((w, k) => used[i + k] || t[i + k] !== w)) continue;
      p.toks.forEach((_, k) => { used[i + k] = true; });
      found.set(key(p.val), p.val);
      break;
    }
  }
  return found;
}

/** "3pt shooters in the SEC", "guards in the big ten", "steals". Anything unrecognised makes it null. */
function statLeaders(t: string[], ix: Index): Intent | null {
  const used = t.map(w => FILLER.has(w));
  const confs = takeAll(t, used, ix.confPhrases, c => c.slug);
  const poss = takeAll(t, used, POS_PHRASES, p => p);
  const stats = takeAll(t, used, STAT_PHRASES, s => s.label);
  if (used.some(u => !u)) return null;
  if (stats.size !== 1 || confs.size > 1 || poss.size > 1) return null;
  const stat = [...stats.values()][0];
  const conf = confs.size ? [...confs.values()][0] : null;
  const pos = poss.size ? [...poss.values()][0] : null;

  const parts = [conf?.display, pos ? POS_PLURAL[pos] : null].filter((x): x is string => !!x);
  const params = new URLSearchParams({ view: viewSlug(stat.view), sort: stat.sort });
  if (conf) params.set("conf", conf.slug);
  if (pos) params.set("pos", pos);
  const chips: Chip[] = [{ kind: "stat", label: stat.label }];
  if (conf) chips.push({ kind: "conf", label: conf.display });
  if (pos) chips.push({ kind: "pos", label: POS_TITLE[pos] });
  return {
    label: `${stat.label} leaders${parts.length ? ` · ${parts.join(" ")}` : ""}`,
    sub: `Player leaderboard · ${stat.view} view`,
    href: `/players/?${params}`,
    chips,
  };
}

export function parseQuery(q: string, ctx: { teams: SmartTeam[] }): Intent | null {
  const t = tokenize(q);
  if (!t.length) return null;
  const ix = indexFor(ctx.teams);
  return matchup(t, ix) ?? teamTab(t, ix) ?? statLeaders(t, ix);
}
