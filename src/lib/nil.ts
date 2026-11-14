// D1 Hoops estimated NIL / market value (public/data/app/nil.json, built by scripts/build-nil.mjs).
// These are model estimates, never reported deals: every place that shows one labels it "Estimate"
// and links to /methodology/#nil. Reported figures from the calibration set are shown separately.
import { useMemo } from "react";
import { useJson } from "./client-data";

export const NIL_METHOD_HREF = "/methodology/#nil";

export type NilRow = [pid: string, teamId: string, value: number, low: number, high: number, share: number, pos: string | null, mpg: number, dpr: number, recRank: number | null, recYear: number | null];
export type NilTeam = {
  budget: number; budgetLow: number; budgetHigh: number; kind: "reported-tier" | "reported" | "estimated"; tier: number | null; tierLabel: string | null;
  onCourt: number; players: number; unseen: number; top: { pid: string; name: string; value: number }[];
};
export type NilSource = { title: string; publisher: string; author: string | null; date: string | null; dateNote?: string; url: string };
export type NilReport = { text: string; value: number; source: string };
export type NilCalPlayer = {
  name: string; team: string; slug: string | null; pid: string | null; low: number; high: number | null; kind: string; note: string | null; reports: NilReport[];
  model: { point: number; low: number; high: number; overlaps: boolean; loo: number } | null;
};
export type NilCalProgram = { team: string; season: string; low: number | null; high: number | null; kind: string; text: string; source: string; slug: string | null; model: { mid: number; low: number; high: number; kind: string } | null };
export type NilFit = {
  params: { minutes: number; dpr: number; recruiting: number; usage: number; posMult: Record<string, number> };
  budgetCurve: { alpha: number; beta: number; r2: number; sd: number; nonPower: { intercept: number; slope: number }; estimatedSigma: number; anchors: { team: string; value: number; note: string; fitted: number; residLog: number }[] };
  shareSigma: number;
  calibration: { players: number; fitted: number; notPlayedYet: string[]; pointFigures: number; floors: number; looMedianAbsPctErr: number | null; looInsideReported: number; looFloorsMet: number; rangeOverlapsReported: number; inSampleMedianAbsPctErr: number | null };
  over39: number;
};
export type NilFile =
  | { ok: false; reason: string }
  | {
      ok: true; season: number; seasonLabel: string; built: string; compiled: string; fields: string[]; rows: NilRow[]; teams: Record<string, NilTeam>; fit: NilFit;
      calibration: { players: NilCalPlayer[]; programs: NilCalProgram[]; sources: Record<string, NilSource>; caveats: string[]; tiers: string;
        landscape: { revenueShareCap: { season: string; amount: number; text: string; source: string }[]; notes: { text: string; source: string }[] };
        priorSeason: { about: string; players: { name: string; team: string; then: string; value: number; source: string }[] } };
    };
export type NilData = Extract<NilFile, { ok: true }>;

/** Load nil.json once (shared cache). `byPid` maps player id -> row. */
export function useNil() {
  const res = useJson<NilFile>("nil.json");
  const byPid = useMemo(() => (res.data?.ok ? new Map(res.data.rows.map(r => [r[0], r])) : null), [res.data]);
  return { ...res, nil: res.data?.ok ? res.data : null, byPid };
}

/** "$1.25M", "$450K", "Under $10K". Values arrive pre-rounded by the build. */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v < 10e3) return "Under $10K";
  if (v < 1e6) return `$${Math.round(v / 1e3)}K`;
  const m = v / 1e6;
  return `$${m >= 10 ? m.toFixed(1).replace(/\.0$/, "") : m.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}M`;
}

/** "$1.1M–$2.6M"; collapses the low end to "<$10K" for tiny values. */
export function fmtRange(low: number, high: number): string {
  const lo = low < 10e3 ? "<$10K" : fmtMoney(low);
  return `${lo}–${high < 10e3 ? "$10K" : fmtMoney(high)}`;
}

/** Plain-language label for a reported figure ("$6M–$7M", "at least $3.9M"). */
export function fmtReported(low: number, high: number | null): string {
  if (high === null) return `at least ${fmtMoney(low)}`;
  return low === high ? fmtMoney(low) : `${fmtMoney(low)}–${fmtMoney(high)}`;
}

export const KIND_WORD: Record<string, string> = {
  range: "Reports disagree; range of reported figures",
  deal: "Reported deal",
  floor: "Reported floor ('at least')",
  on3: "On3 estimate",
  "on3-recruit": "On3 NIL Valuation (as a recruit)",
};

/** "May 6, 2026" from an ISO date, or the note when the page had none. */
export function fmtSourceDate(s: Pick<NilSource, "date" | "dateNote">): string {
  if (!s.date) return "undated";
  const [y, m, d] = s.date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
