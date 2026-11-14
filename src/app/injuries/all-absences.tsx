"use client";
// Every absence, filterable. Filters live in the URL query (replaceState) so a view can be shared.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { InjuryConfidence, InjuryRow } from "@/lib/types";
import InjuryPill, { ConfidenceTag } from "@/components/injury-pill";
import { useFavorites } from "@/lib/favorites";
import { OUT_STATES, SOURCE_LABEL, etaText, lossText, playerHref, shortDate } from "@/lib/injuries";
import { TeamTag, type TeamMetaMap } from "./parts";

type St = "all" | "out" | "unc" | "missed";
type Sort = "impact" | "rank" | "recent";
const CONFS: InjuryConfidence[] = ["confirmed", "reported", "inferred"];
const CONF_NAME: Record<InjuryConfidence, string> = { confirmed: "Confirmed", reported: "Reported", inferred: "Inferred" };
const PAGE = 30;
const rec = (a?: [number, number, number | null]) => (a ? `${a[0]}–${a[1]}` : "—");

const inState = (r: InjuryRow, s: St) => s === "all" || (s === "out" ? OUT_STATES.has(r.state) && r.state !== "missed" : s === "unc" ? r.state === "questionable" || r.state === "dtd" : r.state === "missed");

function Source({ r }: { r: InjuryRow }) {
  const label = r.publisher ?? SOURCE_LABEL[r.source];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <ConfidenceTag value={r.confidence} />
      {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[12.5px]">{label}<ExternalLink size={11} aria-hidden /></a> : <span className="text-[12.5px] text-mute">{label}</span>}
    </span>
  );
}
/** Inferred rows must never read as a confirmed injury. */
const detailOf = (r: InjuryRow) => (r.confidence === "inferred" && !r.body ? "Reason not reported" : [r.body, etaText(r)].filter(Boolean).join(" · ") || r.detail || "—");

export default function AllAbsences({ rows, teams }: { rows: InjuryRow[]; teams: TeamMetaMap }) {
  const fav = useFavorites();
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("all");
  const [st, setSt] = useState<St>("all");
  const [cf, setCf] = useState<Set<InjuryConfidence>>(new Set(CONFS));
  const [top, setTop] = useState<"all" | "25" | "100">("all");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<Sort>("impact");
  const [limit, setLimit] = useState(PAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ(p.get("q") ?? "");
    setConf(p.get("conf") ?? "all");
    const s = p.get("st"); if (s === "out" || s === "unc" || s === "missed") setSt(s);
    const c = (p.get("cf") ?? "").split(",").filter((x): x is InjuryConfidence => (CONFS as string[]).includes(x));
    if (c.length) setCf(new Set(c));
    const t = p.get("top"); if (t === "25" || t === "100") setTop(t);
    setMine(p.get("my") === "1");
    const so = p.get("sort"); if (so === "rank" || so === "recent") setSort(so);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (conf !== "all") p.set("conf", conf);
    if (st !== "all") p.set("st", st);
    if (cf.size !== 3) p.set("cf", [...cf].join(","));
    if (top !== "all") p.set("top", top);
    if (mine) p.set("my", "1");
    if (sort !== "impact") p.set("sort", sort);
    const s = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  }, [ready, q, conf, st, cf, top, mine, sort]);

  const confs = useMemo(() => [...new Set(rows.map(r => r.conf))].filter(Boolean).sort(), [rows]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter(r =>
      (!n || r.name.toLowerCase().includes(n) || r.team.toLowerCase().includes(n)) &&
      (conf === "all" || r.conf === conf) && inState(r, st) && cf.has(r.confidence) &&
      (top === "all" || (r.rank ?? 999) <= Number(top)) && (!mine || fav.teams.includes(r.slug)));
    const nl = (r: InjuryRow) => r.impact.netLoss ?? 0, rk = (r: InjuryRow) => r.rank ?? 999;
    return out.sort(sort === "rank" ? (a, b) => rk(a) - rk(b) || nl(b) - nl(a) : sort === "recent" ? (a, b) => (b.since ?? "").localeCompare(a.since ?? "") || nl(b) - nl(a) : (a, b) => nl(b) - nl(a) || rk(a) - rk(b));
  }, [rows, q, conf, st, cf, top, mine, sort, fav.teams]);
  const reset = () => { setQ(""); setConf("all"); setSt("all"); setCf(new Set(CONFS)); setTop("all"); setMine(false); setSort("impact"); };
  const toggleCf = (c: InjuryConfidence) => { setCf(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n.size ? n : prev; }); setLimit(PAGE); };
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLimit(PAGE); };
  const shown = list.slice(0, limit);
  const field = "h-10 rounded-xl border border-line bg-deck px-3 text-[14px] text-ink placeholder:text-dim";

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search player or team</span>
            <Search size={15} className="absolute left-3 top-3 text-dim" aria-hidden />
            <input type="search" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search player or team" className={`${field} w-full pl-9`} />
          </label>
          <label>
            <span className="sr-only">Conference</span>
            <select value={conf} onChange={e => touch(setConf)(e.target.value)} className={field}>
              <option value="all">All conferences</option>
              {confs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={e => touch(setSort)(e.target.value as Sort)} className={field}>
              <option value="impact">Sort: Impact</option>
              <option value="rank">Sort: Team rank (DHR)</option>
              <option value="recent">Sort: Most recent</option>
            </select>
          </label>
        </div>
        <div className="seg overflow-x-auto" role="group" aria-label="Status">
          {([["all", "All"], ["out", "Out"], ["unc", "Questionable & day-to-day"], ["missed", "Missed games (inferred)"]] as const).map(([k, l]) => <button key={k} aria-pressed={st === k} onClick={() => touch(setSt)(k)}>{l}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Confidence, team set">
          {CONFS.map(c => <button key={c} className="chip" aria-pressed={cf.has(c)} onClick={() => toggleCf(c)}>{CONF_NAME[c]}</button>)}
          <span className="mx-1 h-5 w-px bg-line2" aria-hidden />
          <button className="chip" aria-pressed={top === "25"} onClick={() => touch(setTop)(top === "25" ? "all" : "25")} title="Teams in the DHR top 25">Top 25</button>
          <button className="chip" aria-pressed={top === "100"} onClick={() => touch(setTop)(top === "100" ? "all" : "100")} title="Teams in the DHR top 100">Top 100</button>
          <button className="chip" aria-pressed={mine} onClick={() => touch(setMine)(!mine)}>My teams</button>
        </div>
        <p className="text-[13px] text-mute" role="status">{list.length} of {rows.length} absences{mine && !fav.teams.length ? " · you haven't followed any teams yet" : ""}</p>
      </div>

      {!list.length ? (
        <div className="deck p-6">
          <p className="font-semibold">{rows.length ? "Nothing matches these filters." : "No absences flagged."}</p>
          <p className="mt-1 text-sm text-mute">{rows.length ? "Loosen a filter or reset." : "We check ESPN's injury list, box scores and injury headlines every hour."}</p>
          {rows.length > 0 && <button className="btn mt-3" onClick={reset}>Reset filters</button>}
        </div>
      ) : (
        <>
          {/* Desktop: a real table */}
          <div className="scroll-x hidden rounded-xl border border-line sm:block">
            <table className="dt">
              <thead><tr><th className="l">Player</th><th className="l">Team</th><th className="l">Status</th><th className="l">Injury / timeline</th><th title="Consecutive team games missed">Missed</th><th>MPG</th><th>PPG</th><th title="Estimated team rating lost, points per 100 possessions">Est. impact</th><th title="Team record with / without him">With / without</th><th className="l">Source</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.key}>
                    <td className="l"><Link href={playerHref(r)} className="link font-semibold">{r.name}</Link>{r.pos ? <span className="ml-1.5 text-xs text-dim">{r.pos}</span> : null}</td>
                    <td className="l whitespace-nowrap"><TeamTag slug={r.slug} name={r.team} rank={r.rank} meta={teams[r.slug]} size={18} /></td>
                    <td className="l"><InjuryPill state={r.state} label={r.status} size="sm" /></td>
                    <td className="l max-w-[240px] text-mute" title={r.detail ?? ""}>{detailOf(r)}</td>
                    <td>{r.missed || "—"}</td>
                    <td>{r.impact.mpg?.toFixed(1) ?? "—"}</td>
                    <td>{r.impact.ppg?.toFixed(1) ?? "—"}</td>
                    <td className={r.impact.netLoss && r.impact.netLoss >= 0.05 ? "text-loss" : "text-dim"} title="est.">{lossText(r.impact.netLoss)}</td>
                    <td className="whitespace-nowrap text-mute">{r.ww ? `${rec(r.ww.with)} / ${rec(r.ww.without)}` : "—"}</td>
                    <td className="l"><Source r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone: stacked rows */}
          <ul className="deck divide-y divide-line overflow-hidden sm:hidden">
            {shown.map(r => (
              <li key={r.key} className="px-3.5 py-3" style={{ borderLeft: `4px solid ${teams[r.slug]?.color ?? "var(--line-2)"}` }}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={playerHref(r)} className="link font-display text-[20px] font-bold leading-tight">{r.name}</Link>
                  <InjuryPill state={r.state} label={r.status} size="sm" />
                </div>
                <div className="mt-0.5 text-[13.5px]"><TeamTag slug={r.slug} name={r.team} rank={r.rank} meta={teams[r.slug]} size={16} /></div>
                <p className="mt-1 text-[13.5px] text-mute">{detailOf(r)}{r.since ? ` · since ${shortDate(r.since)}` : ""}</p>
                {(r.impact.mpg != null || r.ww) && (
                  <p className="mt-1 text-[12.5px] text-mute">
                    {[r.impact.mpg != null ? `${r.impact.mpg.toFixed(1)} mpg` : null, r.impact.ppg != null ? `${r.impact.ppg.toFixed(1)} ppg` : null, r.impact.netLoss && r.impact.netLoss >= 0.05 ? `est. ${lossText(r.impact.netLoss)} pts/100` : null, r.ww ? `team ${rec(r.ww.with)} with, ${rec(r.ww.without)} without` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-1.5"><Source r={r} /></div>
              </li>
            ))}
          </ul>
          {list.length > limit && <button className="btn mt-3" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} left)</button>}
        </>
      )}
    </div>
  );
}
