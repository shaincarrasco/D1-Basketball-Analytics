// Small time words for the shell: the offline note's "showing scores from 9:40 PM".

/** "9:40 PM" for a time today (reader's clock), "Nov 17, 9:40 PM" for an earlier day. */
export function clockLabel(ms: number, now: number = Date.now(), timeZone?: string): string {
  const d = new Date(ms);
  const day = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(t));
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  if (day(ms) === day(now)) return time;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}, ${time}`;
}

/**
 * The offline note. `lastLoad` is the time of the last successful live-score fetch in this
 * tab (ms), if any; `dataUpdated` is the published data's own timestamp string (already
 * formatted, e.g. "Nov 17, 9:40 PM EST"), used when no live fetch happened.
 */
export function offlineMessage(lastLoad: number | null, dataUpdated: string | null, now: number = Date.now(), timeZone?: string): string {
  if (lastLoad != null && Number.isFinite(lastLoad) && lastLoad <= now + 60_000) return `You're offline · showing scores from ${clockLabel(lastLoad, now, timeZone)}`;
  if (dataUpdated && dataUpdated.trim()) return `You're offline · showing scores from ${dataUpdated.trim()}`;
  return "You're offline · scores may be out of date";
}
