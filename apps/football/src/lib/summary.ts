// ESPN game summary → GameFile, so a game still in progress gets the same drive chart as a
// finished one (finished games are pre-built into g/{id}.json by the pipeline).
// A play's end spot is start + statYardage in the offense's coordinates: ESPN flips
// end.yardsToEndzone to the new offense after a change of possession, so it can't be used directly.
import type { Drive, GameFile, Play } from "./data";

export const summaryUrl = (id: string) => `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${id}`;
type RawPlay = { type?: { text?: string }; text?: string; period?: { number?: number }; clock?: { displayValue?: string }; start?: { down?: number; distance?: number; yardsToEndzone?: number }; end?: { yardsToEndzone?: number }; statYardage?: number; scoringPlay?: boolean };
type RawDrive = { team?: { id?: string }; displayResult?: string; result?: string; yards?: number; plays?: RawPlay[] };
type Raw = { header?: { competitions?: { competitors?: { id: string; homeAway: string }[] }[] }; drives?: { previous?: RawDrive[]; current?: RawDrive } };

const SKIP = /timeout|end of|end period|end of half|end of game|coin toss/i;
const clamp = (x: number) => Math.max(0, Math.min(100, x));

export function parseSummary(id: string, raw: unknown): GameFile | null {
  const r = raw as Raw;
  const comp = r?.header?.competitions?.[0]?.competitors ?? [];
  const home = comp.find(c => c.homeAway === "home")?.id, away = comp.find(c => c.homeAway === "away")?.id;
  if (!home || !away) return null;
  const list = [...(r.drives?.previous ?? [])];
  if (r.drives?.current && !list.some(d => d === r.drives!.current)) list.push({ ...r.drives.current, displayResult: r.drives.current.displayResult || "In progress" });
  const drives: Drive[] = list.flatMap(d => {
    const plays: Play[] = (d.plays ?? []).filter(p => !SKIP.test(p.type?.text ?? "") && typeof p.start?.yardsToEndzone === "number").map(p => {
      const start = clamp(100 - p.start!.yardsToEndzone!), yds = p.statYardage ?? 0;
      return { q: p.period?.number ?? 0, clock: p.clock?.displayValue ?? "", type: p.type?.text ?? "", text: (p.text ?? "").replace(/^\(\d+:\d+\)\s*/, ""), down: p.start?.down || null, dist: p.start?.distance ?? null, start, end: clamp(start + yds), yds, score: !!p.scoringPlay };
    });
    if (!plays.length || !d.team?.id) return [];
    return [{ team: d.team.id, start: plays[0].start, end: plays[plays.length - 1].end, result: d.displayResult || d.result || "", yards: d.yards ?? 0, plays }];
  });
  return { id, home, away, drives };
}
