"use client";
// High-school prospects: one recruiting class at a time, its players and commitments, and team class rankings.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import TeamLogo from "@sports/ui/team-logo";
import { Empty, Loading } from "@sports/ui/states";
import { useJson } from "@sports/ui/client-data";
import FocusTabs from "@/components/focus-tabs";
import type { ProspectFile, ProspectRow, TeamSummary } from "@/lib/types";

type Group = "Guards" | "Wings" | "Bigs";
const GROUPS: Group[] = ["Guards", "Wings", "Bigs"];
const POS_GROUP: Record<string, Group> = { PG: "Guards", SG: "Guards", CG: "Guards", WG: "Wings", SF: "Wings", PF: "Bigs", C: "Bigs", G: "Guards", F: "Wings", W: "Wings", FC: "Bigs", CF: "Bigs" };
const PAGE = 100;
const EMPTY_MSG = "Prospect data arrives with the next daily refresh.";

type Prospect = {
  year: number; rank: number | null; name: string; pos: string; stars: number | null; ht: number | null; wt: number | null;
  hs: string; city: string; state: string; teamId: string | null; college: string | null;
};

/** Turns the column-ordered rows into objects, looking each column up by its name in `fields`. */
function parseRows(file: ProspectFile): Prospect[] {
  const at = (r: ProspectRow, key: string) => {
    const i = file.fields.indexOf(key);
    return i < 0 ? null : (r[i] ?? null);
  };
  const num = (v: string | number | null) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const str = (v: string | number | null) => (v == null ? "" : String(v).trim());
  return file.rows.map(r => {
    const teamId = str(at(r, "teamId"));
    const college = str(at(r, "college"));
    return {
      year: num(at(r, "year")) ?? 0,
      rank: num(at(r, "rank")),
      name: str(at(r, "name")),
      pos: str(at(r, "pos")).toUpperCase(),
      stars: num(at(r, "stars")),
      ht: num(at(r, "ht")),
      wt: num(at(r, "wt")),
      hs: str(at(r, "hs")),
      city: str(at(r, "city")),
      state: str(at(r, "state")),
      teamId: teamId || null,
      college: college || null,
    };
  });
}

const feetInches = (ht: number | null) => (ht == null ? "—" : `${Math.floor(Math.round(ht) / 12)}'${Math.round(ht) % 12}"`);
const stars = (n: number | null) => (n ? "★".repeat(Math.min(5, n)) : "—");

export default function ProspectsBoard() {
  const file = useJson<ProspectFile>("prospects.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const searchParams = useSearchParams();

  const [picked, setPicked] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<"all" | Group>("all");
  const [uncommittedOnly, setUncommittedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  // ?class=<year> from a shared link. The default (earliest) class is kept out of the URL.
  useEffect(() => {
    const c = Number(searchParams.get("class"));
    if (c) setPicked(c);
  }, [searchParams]);

  const rows = useMemo(() => (file.data ? parseRows(file.data) : []), [file.data]);
  const years = useMemo(() => {
    const ys = file.data?.years?.length ? file.data.years : rows.map(r => r.year);
    return [...new Set(ys)].filter(y => y > 0).sort((a, b) => a - b);
  }, [file.data, rows]);
  const year = picked != null && years.includes(picked) ? picked : years[0];

  const teamsById = useMemo(() => new Map((teams.data ?? []).map(t => [String(t.id), t])), [teams.data]);
  const collegeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rows) if (p.teamId && p.college && !m.has(p.teamId)) m.set(p.teamId, p.college);
    return m;
  }, [rows]);

  const chooseYear = (y: number) => {
    setPicked(y);
    setShown(PAGE);
    const url = new URL(window.location.href);
    if (y === years[0]) url.searchParams.delete("class"); else url.searchParams.set("class", String(y));
    window.history.replaceState(window.history.state, "", url);
  };

  const players = useMemo(
    () => rows.filter(r => r.year === year).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)),
    [rows, year],
  );
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => players.filter(p =>
      (pos === "all" || POS_GROUP[p.pos] === pos) &&
      (!uncommittedOnly || !(p.teamId || p.college)) &&
      (!needle || `${p.name} ${p.hs} ${p.city}`.toLowerCase().includes(needle))),
    [players, pos, uncommittedOnly, needle],
  );

  const classes = useMemo(
    () => (file.data?.classes ?? []).filter(c => c.year === year).sort((a, b) => a.rank - b.rank),
    [file.data, year],
  );

  if (file.status === "loading" || teams.status === "loading") return <Loading label="Loading prospects" />;
  if (file.status === "error" || !file.data || rows.length === 0) return <Empty title="No prospect data yet">{EMPTY_MSG}</Empty>;

  const program = (p: Prospect) => {
    if (!p.teamId && p.college) return <span className="max-w-[7rem] shrink-0 truncate text-[13px] font-semibold">{p.college}</span>;
    if (!p.teamId) return <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-semibold text-mute">Uncommitted</span>;
    const t = teamsById.get(p.teamId);
    const label = t?.short || t?.name || p.college || "Committed";
    const inner = (
      <>
        <TeamLogo src={t?.logo ?? null} name={label} size={22} />
        <span className="max-w-[6.5rem] truncate">{label}</span>
      </>
    );
    if (!t?.slug) return <span className="flex min-w-0 shrink-0 items-center gap-2 text-[13px] font-semibold">{inner}</span>;
    return <Link href={`/teams/${t.slug}/`} className="flex min-w-0 shrink-0 items-center gap-2 text-[13px] font-semibold hover:underline">{inner}</Link>;
  };

  const playersTab = (
    <div>
      <label className="relative mb-3 block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <input className="field w-full !pl-9" placeholder="Name, high school or city" aria-label="Search prospects"
          value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }} />
      </label>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["all", ...GROUPS].map(g => (
          <button key={g} type="button" className="chip" aria-pressed={pos === g}
            onClick={() => { setPos(g as "all" | Group); setShown(PAGE); }}>
            {g === "all" ? "All" : g}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[13.5px] font-semibold">
          <input type="checkbox" checked={uncommittedOnly} onChange={e => { setUncommittedOnly(e.target.checked); setShown(PAGE); }} />
          Uncommitted only
        </label>
      </div>
      <p className="mb-2 text-[13px] text-mute tnum">{filtered.length.toLocaleString("en-US")} {filtered.length === 1 ? "prospect" : "prospects"}</p>
      {filtered.length === 0 ? (
        <Empty title="No prospects match these filters." />
      ) : (
        <>
          <ul className="deck overflow-hidden px-4">
            {filtered.slice(0, shown).map(p => (
              <li key={`${p.year}-${p.name}-${p.hs}`} className="flex h-14 items-center gap-3 border-b border-line last:border-b-0">
                <span className="w-8 shrink-0 text-right font-display text-[17px] tnum">{p.rank ?? "—"}</span>
                <span className="w-14 shrink-0 text-[11px] leading-none text-bulb-ink" aria-label={p.stars ? `${p.stars} star` : "Unrated"}>{stars(p.stars)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{p.name}</p>
                  <p className="truncate text-[12.5px] leading-tight text-mute tnum">
                    {p.pos || "—"} · {feetInches(p.ht)} · {p.wt != null ? `${Math.round(p.wt)} lb` : "—"}
                  </p>
                  <p className="truncate text-[12.5px] leading-tight text-mute">
                    {[p.hs, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {program(p)}
              </li>
            ))}
          </ul>
          {filtered.length > shown && (
            <button type="button" className="btn mt-4 w-full" onClick={() => setShown(s => s + PAGE)}>
              Show more (+{Math.min(PAGE, filtered.length - shown)})
            </button>
          )}
        </>
      )}
    </div>
  );

  const classesTab = (
    <div>
      <p className="mb-3 text-[13.5px] leading-relaxed text-mute">Class points = sum of the commits&apos; composite ratings; our ordering, not any recruiting service&apos;s official team ranking.</p>
      {classes.length === 0 ? (
        <Empty title={`No team classes for ${year} yet.`} />
      ) : (
        <ol className="deck overflow-hidden px-4">
          <li aria-hidden className="flex h-8 items-center gap-2 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-mute">
            <span className="w-7 shrink-0 text-right">#</span>
            <span className="w-[22px] shrink-0" />
            <span className="min-w-0 flex-1">Team</span>
            <span className="w-9 shrink-0 text-right">Commits</span>
            <span className="w-9 shrink-0 text-right">5★</span>
            <span className="w-9 shrink-0 text-right">4★</span>
            <span className="w-12 shrink-0 text-right">Avg</span>
          </li>
          {classes.map(c => {
            const t = teamsById.get(c.teamId);
            const name = t?.name ?? collegeById.get(c.teamId) ?? `Team ${c.teamId}`;
            const slug = t?.slug ?? c.slug;
            return (
              <li key={c.teamId} className="flex h-12 items-center gap-2 border-b border-line last:border-b-0">
                <span className="w-7 shrink-0 text-right font-display text-[17px] tnum">{c.rank}</span>
                <span className="shrink-0"><TeamLogo src={t?.logo ?? null} name={name} size={22} /></span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {slug ? <Link href={`/teams/${slug}/`} className="hover:underline">{name}</Link> : name}
                </span>
                <span className="w-9 shrink-0 text-right tnum">{c.commits}</span>
                <span className="w-9 shrink-0 text-right tnum">{c.five}</span>
                <span className="w-9 shrink-0 text-right tnum">{c.four}</span>
                <span className="w-12 shrink-0 text-right tnum">{c.avgRating != null ? c.avgRating.toFixed(3) : "—"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    <>
      <div role="group" aria-label="Recruiting class" className="seg mb-4 max-w-xs">
        {years.map(y => (
          <button key={y} type="button" className="tnum" aria-pressed={y === year} onClick={() => chooseYear(y)}>{y}</button>
        ))}
      </div>
      <FocusTabs
        param="view"
        tabs={[
          { id: "players", label: "Players", content: playersTab },
          { id: "classes", label: "Team classes", content: classesTab },
        ]}
      />
      <p className="mt-8 text-[13px] leading-relaxed text-mute">
        Rankings, ratings and commitments from College Basketball Data. Commitments can change until a letter is signed. Offer and visit lists are not available from our data provider.
      </p>
    </>
  );
}
