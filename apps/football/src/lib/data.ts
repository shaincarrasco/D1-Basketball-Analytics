// Gridiron's data files (see DATA.md) and small helpers.
export type Team = { id: string; name: string; short: string; abbr: string; color: string | null; altColor: string | null; logo: string | null; confSlug: string; confName: string; wins: number; losses: number; confWins: number; confLosses: number; apRank: number | null; cfpRank: number | null };
/** name/logo are only sent for opponents outside FBS (not in teams.json). */
export type Side = { id: string; score: number | null; rank: number | null; winner: boolean; name?: string; logo?: string | null };
export type Game = { id: string; date: string; status: "pre" | "in" | "post"; detail: string; neutral: boolean; venue: string | null; tv: string | null; home: Side; away: Side };
export type Games = { season: number; currentWeek: number; weeks: { week: number; label: string; start: string; games: Game[] }[] };
export type Poll = { key: "cfp" | "ap" | "coaches"; name: string; date: string; ranks: { rank: number; teamId: string; record: string; points: number | null; firstPlace: number | null; previous: number | null }[] };
export type Rankings = { updated: string; polls: Poll[] };
export type Touch = { gid: string; week: number; q: number; clock: string; kind: "rec" | "inc" | "rush" | "throw"; depth: "short" | "deep" | null; dir: "left" | "middle" | "right" | null; los: number; spot: number | null; end: number | null; yds: number; td: boolean; first: boolean; int: boolean; text: string };
export type PlayerFile = { id: string; games: { gid: string; week: number; date: string; opp: string; home: boolean; result: string; stats: Record<string, number | null> }[]; touches: Touch[] };
export type Play = { q: number; clock: string; type: string; text: string; down: number | null; dist: number | null; start: number; end: number; yds: number; score: boolean };
export type Drive = { team: string; start: number; end: number; result: string; yards: number; plays: Play[] };
export type GameFile = { id: string; home: string; away: string; drives: Drive[] };

export const hex = (c: string | null | undefined) => (c ? (c.startsWith("#") ? c : `#${c}`) : null);
export const teamMap = (ts: Team[] | null) => new Map((ts ?? []).map(t => [t.id, t]));
export const kickoff = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
