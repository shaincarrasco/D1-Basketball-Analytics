// "Where to watch" badges from ESPN's TV/streaming listings. Plain text badges (no network
// logos); outlets with a known official watch page link to it.
import { MonitorPlay, Tv } from "lucide-react";

const WATCH: [RegExp, string][] = [
  [/^(ESPN|ESPN2|ESPNU|ESPNEWS|ESPN\+|ESPN3|ACCN|ACCNX|ACC Network|SECN|SECN\+|SEC Network|LHN|ABC)$/i, "https://www.espn.com/watch/"],
  [/^(FOX|FS1|FS2|BTN|Big Ten Network)$/i, "https://www.foxsports.com/live"],
  [/^(CBS|CBSSN|CBS Sports Network|Paramount\+)$/i, "https://www.cbssports.com/watch/"],
  [/^(TNT|truTV|TBS|Max|HBO Max)$/i, "https://www.max.com/sports"],
  [/^(NBC|USA Net|USA Network|NBCSN)$/i, "https://www.nbcsports.com/watch"],
  [/^Peacock$/i, "https://www.peacocktv.com/sports"],
  [/^B1G\+$/i, "https://www.bigtenplus.com/"],
  [/^FloSports|^FloHoops/i, "https://www.flosports.tv/"],
  [/^YouTube$/i, "https://www.youtube.com/"],
  [/^Prime Video$/i, "https://www.amazon.com/primevideo"],
];
const watchUrl = (name: string) => WATCH.find(([re]) => re.test(name))?.[1] ?? null;
const isStreaming = (name: string, type?: string | null) => (type ? /stream/i.test(type) : /\+$|^ESPN3$|Peacock|YouTube|Flo|Prime|ACCNX|Front Row|Network$/i.test(name));

export default function TvBadges({ tv, max = 3, size = "sm" }: { tv: (string | { name: string; type?: string | null })[] | null | undefined; max?: number; size?: "sm" | "md" }) {
  if (!tv?.length) return null;
  const items = tv.map(t => (typeof t === "string" ? { name: t, type: null } : t));
  const shown = items.slice(0, max), more = items.length - shown.length;
  const cls = size === "md" ? "px-2 py-1 text-[12.5px]" : "px-1.5 py-0.5 text-[11px]";
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`Watch on ${items.map(i => i.name).join(", ")}`}>
      {shown.map(({ name, type }) => {
        const Icon = isStreaming(name, type) ? MonitorPlay : Tv;
        const url = watchUrl(name);
        const body = <><Icon size={size === "md" ? 13 : 11} aria-hidden className="shrink-0" />{name}</>;
        const base = `relative z-10 inline-flex items-center gap-1 rounded border border-line bg-deck2 font-semibold leading-none text-ink ${cls}`;
        return url
          ? <a key={name} href={url} target="_blank" rel="noopener noreferrer" className={`${base} hover:border-line2 hover:text-off`} title={`Watch on ${name}`} onClick={e => e.stopPropagation()}>{body}</a>
          : <span key={name} className={base} title={`On ${name}`}>{body}</span>;
      })}
      {more > 0 && <span className="text-[11px] text-mute">+{more}</span>}
    </span>
  );
}
