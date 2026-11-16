// Fetch wrappers. Errors carry a readable message from the server's `detail` when it has one.

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  } catch {
    throw new Error("Can't reach the Deuce server. Is `python -m app.server` still running?");
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    let msg = body && body.detail;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join(", ");
    throw new Error(msg || `The server answered ${res.status}.`);
  }
  return body;
}

export const api = {
  status: () => request("/api/status"),
  matches: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    return request(`/api/matches${q.toString() ? "?" + q : ""}`);
  },
  match: (id) => request(`/api/matches/${encodeURIComponent(id)}`),
  saveOdds: (id, p1, p2) => request(`/api/matches/${encodeURIComponent(id)}/odds`, {
    method: "POST", body: JSON.stringify({ p1, p2 }),
  }),
  backtest: () => request("/api/backtest"),
  topPlayers: (tour) => request(`/api/players/top?tour=${encodeURIComponent(tour)}`),
};
