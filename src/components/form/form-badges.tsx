// Hot / Cold and Steady / Volatile tags. Each carries its plain-words reason as a tooltip and
// for screen readers; nothing renders unless the rules in src/lib/form.ts are met.
import { Activity, Flame, Minus, Snowflake } from "lucide-react";
import { FORM_WORDS, type ConsistencyBadge, type FormBadge } from "@/lib/form";

const STYLE = {
  hot: { label: "Hot", Icon: Flame, cls: "text-win", bg: "rgb(var(--win-rgb) / 0.12)" },
  cold: { label: "Cold", Icon: Snowflake, cls: "text-loss", bg: "rgb(var(--loss-rgb) / 0.12)" },
  steady: { label: "Steady", Icon: Minus, cls: "text-ink", bg: "rgb(var(--ink-rgb) / 0.07)" },
  volatile: { label: "Volatile", Icon: Activity, cls: "text-ink", bg: "rgb(var(--ink-rgb) / 0.07)" },
} as const;

export function Tag({ kind, why, size = "sm" }: { kind: NonNullable<FormBadge | ConsistencyBadge>; why?: string; size?: "sm" | "md" }) {
  const s = STYLE[kind];
  const tip = `${FORM_WORDS[kind]}${why ? ` ${why}` : ""}`;
  return (
    <span title={tip} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ${s.cls} ${size === "md" ? "px-2.5 py-1 text-[13px]" : "px-2 py-0.5 text-[11.5px]"}`} style={{ background: s.bg }}>
      <s.Icon size={size === "md" ? 13 : 11} aria-hidden />
      {s.label}
      <span className="sr-only">: {tip}</span>
    </span>
  );
}

export default function FormBadges({ form, consistency, formWhy, consistencyWhy, size }: {
  form: FormBadge; consistency: ConsistencyBadge; formWhy?: string; consistencyWhy?: string; size?: "sm" | "md";
}) {
  if (!form && !consistency) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {form && <Tag kind={form} why={formWhy} size={size} />}
      {consistency && <Tag kind={consistency} why={consistencyWhy} size={size} />}
    </span>
  );
}
