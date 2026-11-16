// Daily DPR snapshots so the site can show 30-day change. Pure functions; I/O lives in build-app-data.mjs.
// history = { fields: ["d","o","x"], dates: string[] (ascending ISO yyyy-mm-dd), players: { [id]: ([dpr,dprO,dprD]|null)[] } }
// players[id][i] lines up with dates[i]; null when the player had no qualifying snapshot that day.
export const MAX_DATES = 120;
const r1 = v => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function emptyHistory() { return { fields: ["d", "o", "x"], dates: [], players: {} }; }

/** entries: [{ id, dpr, dprO, dprD }]. Returns a new history (input is not mutated). */
export function appendSnapshot(history, dateISO, entries) {
  const h = history && Array.isArray(history.dates) ? structuredClone(history) : emptyHistory();
  h.fields = ["d", "o", "x"];
  let i = h.dates.indexOf(dateISO);
  if (i === -1) {
    // Insert in order (normally the end).
    i = h.dates.findIndex(d => d > dateISO);
    if (i === -1) i = h.dates.length;
    h.dates.splice(i, 0, dateISO);
    for (const id of Object.keys(h.players)) h.players[id].splice(i, 0, null);
  } else {
    for (const id of Object.keys(h.players)) h.players[id][i] = null; // replace the day wholesale
  }
  for (const e of entries) {
    if (e.dpr == null) continue;
    const arr = h.players[e.id] ?? (h.players[e.id] = new Array(h.dates.length).fill(null));
    arr[i] = [r1(e.dpr), r1(e.dprO), r1(e.dprD)];
  }
  const drop = h.dates.length - MAX_DATES;
  if (drop > 0) {
    h.dates.splice(0, drop);
    for (const id of Object.keys(h.players)) h.players[id].splice(0, drop);
  }
  for (const id of Object.keys(h.players)) if (h.players[id].every(x => x === null)) delete h.players[id];
  return h;
}

const dayMs = 86400000;
const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * dayMs).toISOString().slice(0, 10);

/**
 * DPR change over `days`. Compares the latest snapshot to the closest one at or before (latest date - days);
 * if none is that old, the oldest available is used and `since` says which date. Null with <2 snapshots for the player.
 */
export function change(history, id, days = 30) {
  const arr = history?.players?.[id];
  if (!arr || !history.dates?.length) return null;
  const idxs = arr.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
  if (idxs.length < 2) return null;
  const last = idxs[idxs.length - 1];
  const target = shift(history.dates[last], days);
  let from = idxs[0];
  for (const i of idxs) { if (i < last && history.dates[i] <= target) from = i; }
  if (from === last) return null;
  const a = arr[from][0], b = arr[last][0];
  return { from: a, to: b, delta: Math.round((b - a) * 10) / 10, since: history.dates[from] };
}
