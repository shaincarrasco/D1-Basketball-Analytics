// Reads an injury headline or status string and pulls out what a fan needs: how serious it is,
// what's hurt, what kind of absence it is and when he might be back. Plain regexes, no guessing:
// anything the text doesn't say stays null.

const BODY = [
  [/\bacl\b|anterior cruciate/i, "ACL"],
  [/\bmcl\b/i, "MCL"],
  [/menisc/i, "Meniscus"],
  [/achilles/i, "Achilles"],
  [/concuss/i, "Concussion"],
  [/hamstring/i, "Hamstring"],
  [/groin/i, "Groin"],
  [/\bknees?\b/i, "Knee"],
  [/\bankles?\b/i, "Ankle"],
  [/\bfoot\b|\bfeet\b|plantar|metatarsal|\bheel\b/i, "Foot"],
  [/\btoes?\b/i, "Toe"],
  [/\bhips?\b/i, "Hip"],
  [/\bback\b|\bspine\b|lumbar/i, "Back"],
  [/shoulder|labrum/i, "Shoulder"],
  [/elbow/i, "Elbow"],
  [/wrist/i, "Wrist"],
  [/thumb/i, "Thumb"],
  [/finger/i, "Finger"],
  [/\bhands?\b/i, "Hand"],
  [/\bcalf\b|\bcalves\b/i, "Calf"],
  [/\bquad/i, "Quad"],
  [/\bshin\b|tibia|fibula|\blegs?\b/i, "Leg"],
  [/\beyes?\b|orbital/i, "Eye"],
  [/\bnose\b|\bface\b|facial|\bjaw\b/i, "Face"],
  [/\bhead\b/i, "Head"],
  [/\bheart\b|cardiac/i, "Heart"],
  [/illness|\bflu\b|\bsick\b|virus/i, "Illness"],
];

/** States, most to least serious. "monitor" = hurt or in the news but no absence reported yet. */
export const STATES = ["season", "out", "doubtful", "questionable", "dtd", "missed", "monitor"];
export const STATE_LABEL = { season: "Out for season", out: "Out", doubtful: "Doubtful", questionable: "Questionable", dtd: "Day-to-day", missed: "Missed games", monitor: "Monitoring" };
/** States that take a player off the floor (count toward missing minutes). */
export const OUT_STATES = new Set(["season", "out", "doubtful", "missed"]);

const words = n => ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, a: 1, several: 3, few: 2, couple: 2 })[n.toLowerCase()] ?? Number(n);

/** Weeks range mentioned in the text, e.g. "6-8 weeks" → [6, 8], "two months" → [8, 9]. */
export function weeksOf(text) {
  const t = String(text ?? "");
  let m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a few|several|a couple(?: of)?)\s*(?:(?:-|–|to|or)\s*(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*)?weeks?\b/i);
  if (m) { const a = words(m[1].replace(/^a (few|couple).*$/i, "$1")), b = m[2] ? words(m[2]) : a; if (Number.isFinite(a) && Number.isFinite(b)) return [a, b]; }
  m = t.match(/\b(\d+|one|two|three|four|five|six|a few|several)\s*(?:(?:-|–|to|or)\s*(\d+|two|three|four|five|six)\s*)?months?\b/i);
  if (m) { const a = words(m[1].replace(/^a few$/i, "few")), b = m[2] ? words(m[2]) : a; if (Number.isFinite(a) && Number.isFinite(b)) return [Math.round(a * 4.3), Math.round(b * 4.3) + 1]; }
  return null;
}

/**
 * Classify an injury headline / status string.
 * @returns {{ state: string|null, kind: string, body: string|null, expected: string|null, weeks: [number, number]|null, returning: boolean }}
 */
export function classify(text) {
  const t = String(text ?? "");
  const body = BODY.find(([re]) => re.test(t))?.[1] ?? null;
  const kind = /suspen/i.test(t) ? "suspension"
    : /ineligib|eligibility|waiver|ncaa (denies|rules)|not been cleared by the ncaa/i.test(t) ? "eligibility"
    : /illness|\bflu\b|\bsick\b|virus/i.test(t) ? "illness"
    : /personal|family matter|bereavement|leave of absence/i.test(t) ? "personal"
    : body || /injur|surgery|hurt|torn|tear|sprain|fracture|broken|strain|bruise|contusion|sidelined|banged|limp/i.test(t) ? "injury"
    : "unknown";
  const weeks = weeksOf(t);
  const returning = /\b(return(s|ed|ing)? (to|from|for|vs\.?|against|in)|is back|back in (the )?(lineup|action)|cleared to (play|return)|makes? (his |season |collegiate )?debut|made (his |season )?debut|will play|set to return|expected to (play|return)|available (to play|for|vs)|upgraded to available|good to go)\b/i.test(t)
    && !/\b(won'?t|will not|not expected to|unlikely to|doubtful to)\b.{0,20}\b(return|play)/i.test(t);

  let state = null, expected = null;
  const seasonRe = /out for (the )?(season|year|20\d\d-?\d*)|season[- ]ending|(miss|out|sidelined) (for )?(the )?(rest of the|remainder of the|entire|whole) (season|year)|miss(es)? (the |his )?(20\d\d-\d\d )?season|will redshirt|to redshirt|medical redshirt/i;
  if (seasonRe.test(t) || (/\b(torn|tear|tears|ruptur)/i.test(t) && /\bacl\b|achilles/i.test(t))) { state = "season"; expected = "Season"; }
  else if (/indefinite/i.test(t)) { state = "out"; expected = "Indefinite"; }
  else if (/\b(until|till|through|before|into|by|in) (early |mid-?|late )?(january|february|march|december|conference play|the new year|league play)\b/i.test(t) && /\b(out|miss|sidelined|broken|fracture|surgery)/i.test(t)) {
    const m = t.match(/\b(?:until|till|through|before|into|by|in) ((?:early |mid-?|late )?(?:january|february|march|december|conference play|the new year|league play))\b/i);
    state = "out"; expected = `Until ${m[1].replace(/^\w/, c => c.toUpperCase())}`;
  }
  else if (weeks) { state = "out"; expected = weeks[0] === weeks[1] ? `${weeks[0]} week${weeks[0] === 1 ? "" : "s"}` : `${weeks[0]}–${weeks[1]} weeks`; }
  else if (/\bdoubtful\b/i.test(t)) state = "doubtful";
  else if (/questionable|game[- ]time decision|\bgtd\b|status (is )?uncertain|uncertain (status|for)/i.test(t)) state = "questionable";
  else if (/day[- ]to[- ]day/i.test(t)) { state = "dtd"; expected = "Day-to-day"; }
  else if (/week[- ]to[- ]week/i.test(t)) { state = "out"; expected = "Week-to-week"; }
  else if (/\bprobable\b/i.test(t)) state = "monitor";
  else if (/\bsuspend/i.test(t)) state = "out";
  else if (kind === "eligibility") state = "out";
  else if (/\b(out|ruled out|will miss|to miss|misses|missed|sidelined|won'?t play|will not play|not expected to play|unavailable|inactive|did not dress|surgery|out vs\.?|out against)\b/i.test(t)) state = "out";
  else if (/injur|hurt|leaves|left the game|exits|helped off|carried off|limp|tweak|banged/i.test(t)) state = "monitor";
  if (returning && !(state === "season" && /(torn|tear|surgery)/i.test(t))) state = null;
  return { state, kind, body, expected, weeks, returning };
}

/** Words that make a headline worth reading as an availability note. */
export const INJURY_WORDS = /injur|surgery|torn|tear\b|sprain|fracture|broken|concussion|out for|out indefinitely|sidelined|suspend|day-to-day|questionable|doubtful|game-time decision|status uncertain|will miss|to miss|misses|ruled out|ineligib|eligibility|waiver|redshirt|illness|return(s|ed)? from|returns to|cleared to|debut|leave of absence|hurt\b|strain|achilles|\bacl\b/i;
