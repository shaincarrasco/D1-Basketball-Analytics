"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import TeamLogo from "@sports/ui/team-logo";
import { ErrorState, Loading } from "@sports/ui/states";
import { useJson } from "@sports/ui/client-data";
import { fmt, signed } from "@sports/ui/format";
import type { RisersFile, TeamSummary } from "@/lib/types";

type Mode = "risers" | "fallers";

function sinceLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function RisersBoard() {
  const file = useJson<RisersFile>("risers.json");
  const teams = useJson<TeamSummary[]>("teams.json");
  const [mode, setMode] = useState<Mode>("risers");
  const bySlug = useMemo(() => new Map((teams.data ?? []).map(t => [t.slug, t])), [teams.data]);

  if (file.status === "error" || teams.status === "error") return <ErrorState message={file.error ?? teams.error ?? "Could not load risers."} retry={() => { file.retry(); teams.retry(); }} />;
  if (!file.data || !teams.data) return <Loading label="Loading risers" />;

  const rows = file.data[mode] ?? [];
  return (
    <section className="deck p-5" aria-label="DPR risers and fallers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Show" className="inline-flex rounded-full border border-line p-0.5">
          {(["risers", "fallers"] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`h-8 rounded-full px-4 text-[13px] font-semibold ${mode === m ? "bg-ink text-bg" : "text-mute hover:text-ink"}`}>
              {m === "risers" ? "Risers" : "Fallers"}
            </button>
          ))}
        </div>
        {file.data.since && <span className="text-xs text-mute">Change since {sinceLabel(file.data.since)}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-mute">Needs a few days of daily snapshots; fills in automatically.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {rows.map((r, i) => {
            const [id, name, slug, dpr, d30] = r as [string, string, string | null, number | null, number];
            const team = slug ? bySlug.get(slug) : undefined;
            return (
              <li key={id} className="flex h-12 items-center gap-3">
                <span className="w-7 text-right text-sm text-mute tnum">{i + 1}</span>
                {team ? <TeamLogo src={team.logo} name={team.name} size={24} /> : <TeamLogo src={null} name="?" size={24} />}
                <span className="min-w-0 flex-1">
                  <Link href={`/player/?id=${id}`} className="block truncate text-sm font-semibold hover:underline">{name}</Link>
                  <span className="block truncate text-[11.5px] text-mute">{team?.name ?? ""}</span>
                </span>
                <span className="w-14 text-right text-sm tnum">{signed(dpr)}</span>
                <span className={`w-16 text-right text-sm font-semibold tnum ${d30 > 0 ? "text-win" : "text-loss"}`}>{d30 > 0 ? "▲" : "▼"} {fmt(Math.abs(d30))}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
