// Derives compact per-game analytics from an ESPN summary payload:
//   line   pregame spread/total (home perspective), from ESPN's pick center
//   flow   score after every scoring play: [elapsedSec, home, away]
//   shots  every field-goal attempt: [teamId, athleteId, x, y, made, value, kind, assisted]
//          x = 0–50 ft across the court, y = ft out from the basket line (ESPN coordinates)
//   stints five-man units on the floor: [teamId, startSec, endSec, ids[5], ptsFor, ptsAgainst]
// Everything is ESPN ids (teams + athletes); joins happen in build-app-data.mjs.

const KIND = { JumpShot: "J", LayUpShot: "L", DunkShot: "D", TipShot: "T", HookShot: "H" };

export function clockSeconds(display) {
  const [m, s] = String(display ?? "0:00").split(":").map(Number);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
}
export function elapsed(period, clock) {
  const left = clockSeconds(clock);
  return period <= 2 ? (period - 1) * 1200 + (1200 - left) : 2400 + (period - 3) * 300 + (300 - left);
}

export function derivePbp(sum) {
  const comp = sum?.header?.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find(c => c.homeAway === "home"), away = comp.competitors?.find(c => c.homeAway === "away");
  if (!home || !away) return null;
  const homeId = String(home.id), awayId = String(away.id);
  const plays = Array.isArray(sum.plays) ? sum.plays : [];

  // Pregame line: negative spread = home favoured.
  let line = null;
  const pc = Array.isArray(sum.pickcenter) ? sum.pickcenter.find(p => typeof p.spread === "number") : null;
  if (pc) {
    const homeFav = pc.homeTeamOdds?.favorite === true ? true : pc.awayTeamOdds?.favorite === true ? false : null;
    const mag = Math.abs(pc.spread);
    line = { provider: pc.provider?.name ?? null, spread: homeFav === null ? null : homeFav ? -mag : mag, total: typeof pc.overUnder === "number" ? pc.overUnder : null };
  }

  const flow = [[0, 0, 0]];
  const shots = [];
  let lastH = 0, lastA = 0;
  for (const p of plays) {
    const period = p.period?.number ?? 1, t = elapsed(period, p.clock?.displayValue);
    const h = Number(p.homeScore ?? lastH), a = Number(p.awayScore ?? lastA);
    if (h !== lastH || a !== lastA) { flow.push([t, h, a]); lastH = h; lastA = a; }
    const type = p.type?.text ?? "";
    if (p.shootingPlay && type !== "MadeFreeThrow" && !/FreeThrow/i.test(type) && p.coordinate && p.team?.id) {
      const x = Number(p.coordinate.x), y = Number(p.coordinate.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -5 || x > 55) continue;
      shots.push([String(p.team.id), String(p.participants?.[0]?.athlete?.id ?? ""), Math.round(x * 10) / 10, Math.round(y * 10) / 10,
        p.scoringPlay ? 1 : 0, p.pointsAttempted === 3 || p.scoreValue === 3 ? 3 : 2, KIND[type] ?? "J", /assisted by/i.test(p.text ?? "") ? 1 : 0]);
    }
  }

  // Lineup stints: starters from the box score, then apply substitutions in order.
  const stints = [];
  const box = sum.boxscore?.players ?? [];
  const onFloor = new Map();
  for (const t of box) {
    const ids = (t.statistics?.[0]?.athletes ?? []).filter(a => a.starter).map(a => String(a.athlete?.id));
    if (ids.length === 5) onFloor.set(String(t.team?.id), new Set(ids));
  }
  if (onFloor.size === 2) {
    const start = new Map([[homeId, 0], [awayId, 0]]);
    const score = { [homeId]: 0, [awayId]: 0 };
    const startScore = new Map([[homeId, { f: 0, a: 0 }], [awayId, { f: 0, a: 0 }]]);
    const close = (team, t) => {
      const ids = [...onFloor.get(team)];
      const opp = team === homeId ? awayId : homeId;
      const s0 = startScore.get(team);
      if (ids.length === 5 && t > start.get(team)) stints.push([team, start.get(team), t, ids.sort(), score[team] - s0.f, score[opp] - s0.a]);
      start.set(team, t); startScore.set(team, { f: score[team], a: score[opp] });
    };
    let pendingSubs = null, subTime = null;
    const flushSubs = () => {
      if (!pendingSubs) return;
      for (const [team, ops] of pendingSubs) {
        if (!onFloor.has(team)) continue;
        close(team, subTime);
        const set = onFloor.get(team);
        for (const [dir, id] of ops) dir === "out" ? set.delete(id) : set.add(id);
        // Data glitches can leave more or fewer than five; stints are only kept when exactly five.
      }
      pendingSubs = null;
    };
    for (const p of plays) {
      const period = p.period?.number ?? 1, t = elapsed(period, p.clock?.displayValue);
      const type = p.type?.text ?? "";
      if (type === "Substitution" && p.team?.id) {
        if (pendingSubs && subTime !== t) flushSubs();
        pendingSubs ??= new Map(); subTime = t;
        const team = String(p.team.id), id = String(p.participants?.[0]?.athlete?.id ?? "");
        if (!pendingSubs.has(team)) pendingSubs.set(team, []);
        pendingSubs.get(team).push([/subbing out/i.test(p.text ?? "") ? "out" : "in", id]);
        continue;
      }
      flushSubs();
      score[homeId] = Number(p.homeScore ?? score[homeId]);
      score[awayId] = Number(p.awayScore ?? score[awayId]);
    }
    flushSubs();
    const end = plays.length ? elapsed(plays.at(-1).period?.number ?? 2, plays.at(-1).clock?.displayValue) : 2400;
    close(homeId, end); close(awayId, end);
  }
  return { homeId, awayId, line, flow, shots, stints };
}
