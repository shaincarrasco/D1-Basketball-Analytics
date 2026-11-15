// Play-by-play parsing. Turns ESPN play text into events (throw / rec / inc / rush / sack) with
// spots in the offense's coordinates: x = 0..100, offense attacks toward 100 (see DATA.md).
//
// Play text uses short team codes that can differ from the header abbreviation (text "SJS49",
// header "SJSU"), so tokens are resolved per game: exact header match, then codes learned from
// play-end possessionText, then a unique prefix match.

export const clamp = (x) => Math.max(0, Math.min(100, x));

/** Plays that are clock or period markers, not football. */
export const isMarker = (type) => /^(Timeout|End Period|End of Half|End of Game|End of Period)/i.test(type ?? "");

/** x from ESPN's yardsToEndzone, seen from the team that owns the spot. */
export function fieldX(yte, persp, offense) {
  if (yte == null || persp == null || offense == null) return null;
  const x = 100 - yte; // distance from the perspective team's own goal line
  return persp === offense ? x : 100 - x;
}

/**
 * x for a spot "TOK n". Own side = n, opponent side = 100 - n. When the code cannot be tied to a team
 * (ambiguous like "State", or unseen), the candidate nearest the line of scrimmage is used.
 */
const spotNum = (tok, n, offense, resolve, los = null) => {
  if (!tok) return n; // no team code: midfield
  const team = resolve(tok);
  if (team != null) return team === offense ? n : 100 - n;
  if (los == null) return null;
  return Math.abs(n - los) <= Math.abs(100 - n - los) ? n : 100 - n;
};

/** Drive start/end text such as "USC 23" or "SJSU 3" (header codes), in the drive team's coordinates. */
export function spotText(text, offense, resolve) {
  const m = /^(?:([A-Z]{2,5}) )?(\d{1,2})$/.exec(String(text ?? "").trim());
  return m ? spotNum(m[1], Number(m[2]), offense, resolve) : null;
}

/** Builds resolve(code) -> teamId for one game. */
export function tokenResolver(rec) {
  const header = new Map([
    [rec.home.abbr.toUpperCase(), rec.home.id],
    [rec.away.abbr.toUpperCase(), rec.away.id],
  ]);
  const votes = new Map(); // code -> Map(teamId -> count)
  const vote = (tok, team) => {
    if (!votes.has(tok)) votes.set(tok, new Map());
    const m = votes.get(tok);
    m.set(team, (m.get(team) ?? 0) + 1);
  };
  for (const d of rec.drives) {
    for (const p of d.plays) {
      const m = p.ePos && /^([A-Z]{2,5}) (\d{1,2})$/.exec(p.ePos);
      if (!m || !header.has(m[1]) || !p.text) continue;
      const n = Number(m[2]);
      const team = header.get(m[1]);
      for (const hit of p.text.matchAll(new RegExp(`\\b([A-Za-z]{2,15}) ?0?${n}\\b`, "g"))) vote(hit[1], team);
    }
  }
  return (tok) => {
    if (header.has(tok)) return header.get(tok);
    const v = votes.get(tok);
    if (v) return v.size === 1 ? [...v.keys()][0] : null; // a code both teams use is ambiguous
    const cands = [...header.keys()].filter((k) => k.startsWith(tok));
    return cands.length === 1 ? header.get(cands[0]) : null;
  };
}

const TOKEN = "([A-Za-z]{2,15})? ?(\\d{1,2})\\b"; // "USC30" or "AU 31"
const SPOT = {
  complete: new RegExp(`caught at ${TOKEN}`),
  incomplete: new RegExp(`thrown to ${TOKEN}`),
  intercepted: new RegExp(`intercepted by #\\d+ [^\\s,()#]+ at ${TOKEN}`),
};
const ACTOR = /#(\d+) ([^\s,()#]+)(?: (?:Jr\.|Sr\.|III|IV|II|V)(?=\s))?/;
const PASS = /^\s*pass (complete|incomplete|intercepted)(?: (short|deep))?(?: (left|middle|right))?/;
const TARGET = /\bto #(\d+) ([^\s,()#]+)/;
const RUSH = /^\s*(?:rush|scramble)\w*/;
const RUSH_DIR = /^\s*(?:rush|scramble)\w*\s+(?:up the middle|(left|middle|right))/;
const SACK = /^\s*sacked\b/;
const SACK_LOSS = /sacked for (?:a )?loss of (\d+)/;
const SKIP = /NO PLAY|\bkneels?\b|\bspikes?\b|two[- ]point|\b2-PT\b|TWO-POINT/i;

/**
 * Events for one play. Returns [] for anything that is not a pass, a run, or a sack
 * (kicks, returns, penalties with NO PLAY, kneels, spikes, two-point tries).
 * ctx: { gid, week, resolveTok(code), player(teamId, jersey, lastNameToken) -> athleteId|null }
 */
export function classify(p, ctx) {
  const text = p.text ?? "";
  const off = p.sT;
  if (!text || off == null || isMarker(p.type) || SKIP.test(text)) return [];
  // Normally "#jersey Name verb ..."; sometimes the team name stands in for the player ("Shotgun Cincinnati rush middle").
  // The verb decides the play. The actor counts only when he comes before it (later "#4 C.Cook" lines are recoveries).
  // Some rushing touchdowns are written "Jadan Baugh 15 Yd Run (Kick)": no jersey, no verb.
  const rtd = /^(.+?) (\d+) Yd Run\b/.exec(text);
  if (rtd) {
    const base0 = { gid: ctx.gid, week: ctx.week, q: p.q, clock: p.clock, text, down: p.down, dist: p.dist, offense: off,
      los: fieldX(p.sY, p.sT, off), yds: p.yds ?? Number(rtd[2]), first: /1ST DOWN/.test(text), td: true };
    base0.end = base0.los == null ? null : clamp(base0.los + base0.yds);
    return [{ ...base0, kind: "rush", player: ctx.byName ? ctx.byName(off, rtd[1]) : null, dir: null, depth: null, spot: null }];
  }
  const v = /\b(pass (?:complete|incomplete|intercepted)|rush|scramble|sacked)\b/.exec(text);
  if (!v) return [];
  const am = ACTOR.exec(text);
  let rest = text.slice(v.index);
  let actor = null;
  if (am && am.index < v.index) {
    rest = text.slice(am.index + am[0].length);
    actor = ctx.player(off, am[1], am[2]);
  }
  const base = {
    gid: ctx.gid,
    week: ctx.week,
    q: p.q,
    clock: p.clock,
    text,
    down: p.down,
    dist: p.dist,
    offense: off,
    los: fieldX(p.sY, p.sT, off),
    yds: p.yds ?? 0,
    first: /1ST DOWN/.test(text),
    td: /\bTOUCHDOWN\b/.test(text),
  };

  // End spot = los + statYardage, clamped (ESPN's end.yardsToEndzone flips side after a change of possession).
  base.end = base.los == null ? null : clamp(base.los + base.yds);

  const pm = PASS.exec(rest);
  if (pm) {
    const kind = pm[1];
    const cmp = kind === "complete";
    const isInt = kind === "intercepted";
    const depth = pm[2] ?? null;
    const dir = pm[3] ?? null;
    const spot = spotOf(SPOT[kind], text, off, ctx.resolveTok, base.los);
    const td = base.td && !isInt;
    const out = [{ ...base, kind: "throw", player: actor, depth, dir, spot, cmp, int: isInt, td, yds: cmp ? base.yds : 0 }];
    const tm = TARGET.exec(rest);
    if (tm && !isInt) {
      out.push({ ...base, kind: cmp ? "rec" : "inc", player: ctx.player(off, tm[1], tm[2]), depth, dir, spot, td, yds: cmp ? base.yds : 0 });
    }
    return out;
  }
  if (RUSH.test(rest)) {
    const rd = RUSH_DIR.exec(rest);
    return [{ ...base, kind: "rush", player: actor, dir: rd ? (rd[1] ?? "middle") : null, depth: null, spot: null }];
  }
  if (SACK.test(rest)) {
    const lm = SACK_LOSS.exec(rest);
    const lost = lm ? Number(lm[1]) : Math.max(0, -(p.yds ?? 0));
    return [{ ...base, kind: "sack", player: actor, lost }];
  }
  return [];
}

function spotOf(re, text, offense, resolve, los) {
  const m = re.exec(text);
  return m ? spotNum(m[1], Number(m[2]), offense, resolve, los) : null;
}
